import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { assign, assignedOf, availableOf, cardOf } from './budget';
import { recreateTestUser } from './clerk';
import { onboard } from './onboarding';

export const LONG_NAME = 'Ubezpieczeniehipotecznemieszkania';
export const GOAL_CATEGORY = 'Housing';

const SHORT_GOAL = 'Utilities';
const FIVE_DIGIT_GOAL = 'Phone and internet';
const GOAL_CARDS = [GOAL_CATEGORY, SHORT_GOAL, FIVE_DIGIT_GOAL];
const NAME_GAP = 8;
const NARROWEST_CARD = 320;

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (found === null) throw new Error(`${locator.toString()} is not laid out on the page`);

  return found;
}

async function setMonthlyGoal(page: Page, category: string, amount: string): Promise<void> {
  await cardOf(page, category).click();
  await page.getByRole('button', { name: en['categories.manage'] }).click();
  await page.getByRole('button', { name: en['categories.goal'], exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(en['categories.goalContribute']) }).click();
  await page.getByRole('textbox', { name: en['categories.goalAmount'] }).fill(amount);
  await page.getByRole('button', { name: en['categories.save'] }).click();
  await expect(page.getByRole('textbox', { name: en['categories.goalAmount'] })).toHaveCount(0);
}

async function addCategory(page: Page, group: string, name: string): Promise<void> {
  await page
    .getByRole('button', { name: en['categories.addTo'].replace('{{group}}', group) })
    .click();
  await page.getByLabel(en['categories.nameLabel'], { exact: true }).fill(name);
  await page.getByRole('button', { name: en['categories.save'] }).click();
  await expect(availableOf(page, name)).toBeVisible();
}

export async function signInWithMixedCards(page: Page, email: string): Promise<void> {
  await recreateTestUser(email);
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: email } });
  await onboard(page);

  await setMonthlyGoal(page, GOAL_CATEGORY, '123456.78');
  await setMonthlyGoal(page, SHORT_GOAL, '40');
  await setMonthlyGoal(page, FIVE_DIGIT_GOAL, '12345.67');
  await addCategory(page, 'Bills', LONG_NAME);
  await assign(page, '999.99', LONG_NAME);
  await assign(page, '123456.77', GOAL_CATEGORY);
  await assign(page, '12345.66', FIVE_DIGIT_GOAL);
  await expect(assignedOf(page, GOAL_CATEGORY)).toContainText('123,456.77');
  await expect(assignedOf(page, FIVE_DIGIT_GOAL)).toContainText('12,345.66');
  await expect(availableOf(page, LONG_NAME)).toHaveText('$999.99');
}

export const billsGroup = (page: Page): Locator =>
  page.locator('section', { has: page.getByTestId(`category-tile-${GOAL_CATEGORY}`) });

export async function settle(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await billsGroup(page).evaluate((group) =>
    Promise.all(
      group
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running')
        .map((animation) => animation.finished),
    ),
  );
}

export async function snapshot(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const group = billsGroup(page);
  await group.scrollIntoViewIfNeeded();
  await settle(page);

  const shot = testInfo.outputPath(`${label}.png`);
  await group.screenshot({ path: shot, animations: 'disabled' });
  await testInfo.attach(label, { path: shot, contentType: 'image/png' });
}

async function nameOf(tile: Locator): Promise<string> {
  const id = await tile.getAttribute('data-testid');
  if (id === null) throw new Error('A category tile carries no data-testid to read its name from');

  return id.replace('category-tile-', '');
}

async function isStacked(tile: Locator, value: Locator, labels: string[]): Promise<boolean> {
  const label = tile
    .getByText(new RegExp(`^(${labels.join('|')})$`))
    .filter({ visible: true })
    .first();
  const valueBox = await box(value);
  const labelBox = await box(label);

  return valueBox.y >= labelBox.y + labelBox.height - 1;
}

export type CardShape = {
  columns: number;
  stacked?: boolean;
  ringInPopover: boolean;
};

export async function expectCardsInShape(page: Page, shape: CardShape): Promise<void> {
  if (shape.ringInPopover) {
    const ring = page
      .getByTestId(`category-tile-${GOAL_CATEGORY}`)
      .locator('[data-slot="spend-ring"]');

    expect
      .soft(
        await ring.evaluate((node) => getComputedStyle(node).display),
        'the ring of a card with a goal lays itself out as a box, not as an inline run',
      )
      .not.toBe('inline');
  }

  const shapes = new Set<boolean>();
  const lefts = new Set<number>();
  const group = await box(billsGroup(page));
  const tiles = await billsGroup(page).locator('[data-testid^="category-tile-"]').all();

  for (const tile of tiles) {
    const name = await nameOf(tile);
    const card = await box(tile);
    lefts.add(Math.round(card.x));

    expect
      .soft(card.x + card.width, `${name} fits inside its group`)
      .toBeLessThanOrEqual(group.x + group.width + 0.5);

    expect
      .soft(card.width, `${name} is wide enough to read`)
      .toBeGreaterThanOrEqual(NARROWEST_CARD);

    shapes.add(
      await isStacked(tile, page.getByTestId(`spent-${name}`), [
        en['categories.spent'],
        en['categories.incoming'],
      ]),
    );
    shapes.add(
      await isStacked(tile, page.getByTestId(`assigned-${name}`), [
        en['categories.assigned'],
        en['categories.goalMonthlyTarget'],
      ]),
    );
  }

  expect.soft(lefts.size, 'the grid holds as many columns as its width allows').toBe(shape.columns);

  const goalHeights = new Set<number>();
  for (const name of GOAL_CARDS) {
    goalHeights.add(Math.round((await box(page.getByTestId(`assigned-${name}`))).height));
  }
  expect
    .soft([...goalHeights], 'a short and a long goal take the same number of lines')
    .toHaveLength(1);

  const rows = new Map<number, { height: number; figuresBottom: number }[]>();
  for (const tile of tiles) {
    const card = await box(tile);
    const figures = await box(tile.locator('[data-slot="tile-figures"]'));
    const top = Math.round(card.y);
    rows.set(top, [
      ...(rows.get(top) ?? []),
      { height: card.height, figuresBottom: figures.y + figures.height },
    ]);
  }
  for (const [top, row] of rows) {
    const heights = row.map((one) => one.height);
    const bottoms = row.map((one) => one.figuresBottom);
    expect
      .soft(
        Math.max(...heights) - Math.min(...heights),
        `cards in the row at ${top} share a height`,
      )
      .toBeLessThanOrEqual(1);
    expect
      .soft(
        Math.max(...bottoms) - Math.min(...bottoms),
        `cards in the row at ${top} end their figures on one line`,
      )
      .toBeLessThanOrEqual(1);
  }
  expect.soft([...shapes], 'every row of every card follows one layout').toHaveLength(1);

  if (shape.stacked !== undefined) {
    expect
      .soft([...shapes], shape.stacked ? 'rows stack in a narrow card' : 'rows stay on one line')
      .toEqual([shape.stacked]);
  }

  const name = page.getByTestId(`category-tile-${LONG_NAME}`).getByTestId('category-name');
  const title = await box(name);

  expect
    .soft(
      await name.evaluate((node) => node.scrollWidth - node.clientWidth),
      'a long name wraps inside its own box instead of spilling out of it',
    )
    .toBeLessThanOrEqual(0);

  const amount = await box(availableOf(page, LONG_NAME));

  expect
    .soft(amount.x - (title.x + title.width), 'a long name stops short of the amount')
    .toBeGreaterThanOrEqual(NAME_GAP);
}
