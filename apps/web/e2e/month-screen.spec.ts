import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { availableOf, cardOf } from './budget';
import { hasClerkKeys, MONTH_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const NEW_GROUP = 'Pets';

const groupNames = (page: Page) =>
  page.locator('[data-testid^="category-group-"] > div > button[aria-expanded]').allTextContents();

const groupHandle = (page: Page, group: string) =>
  page.getByRole('button', { name: en['categories.reorderGroup'].replace('{{group}}', group) });

const groupOf = (page: Page, group: string) =>
  page.locator('[data-testid^="category-group-"]').filter({
    has: page.getByRole('button', {
      name: en['categories.groupToggle'].replace('{{group}}', group),
    }),
  });

async function drag(page: Page, grip: Locator, onto: Locator): Promise<void> {
  await grip.scrollIntoViewIfNeeded();
  await grip.hover();

  const from = await grip.boundingBox();
  const to = await onto.boundingBox();
  if (!from || !to) {
    throw new Error('The two ends of the drag are not on the screen');
  }

  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const step of [0.15, 0.4, 0.7, 1]) {
    await page.mouse.move(start.x + (end.x - start.x) * step, start.y + (end.y - start.y) * step, {
      steps: 6,
    });
    await page.waitForTimeout(120);
  }

  await page.mouse.move(end.x + 4, end.y + 4, { steps: 3 });
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

test('a group is dragged into a new place, an empty one offers a category, and a category is closed for the month', async ({
  page,
}) => {
  await recreateTestUser(MONTH_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: MONTH_TEST_EMAIL },
  });

  await onboard(page);
  await expect(availableOf(page, 'Groceries')).toBeVisible();

  const before = await groupNames(page);
  expect(before[0]).toBe('Bills');

  await drag(page, groupHandle(page, 'Financial goals'), groupHandle(page, 'Bills'));

  await expect.poll(() => groupNames(page)).not.toEqual(before);

  await page.reload();
  await expect(availableOf(page, 'Groceries')).toBeVisible();

  const after = await groupNames(page);
  expect(after).not.toEqual(before);
  expect(after[0]).toBe('Financial goals');
  expect([...after].sort()).toEqual([...before].sort());

  await page.getByRole('button', { name: en['categories.addGroup'] }).click();
  await page.getByLabel(en['categories.nameLabel'], { exact: true }).fill(NEW_GROUP);
  await page.getByRole('button', { name: en['categories.save'] }).click();

  const emptyCard = groupOf(page, NEW_GROUP).locator('[data-testid^="empty-group-"]');
  await expect(emptyCard).toBeVisible();
  await expect(emptyCard).toHaveAccessibleName(
    en['categories.addTo'].replace('{{group}}', NEW_GROUP),
  );

  await emptyCard.click();
  await expect(page.getByLabel(en['categories.nameLabel'], { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel(en['categories.nameLabel'], { exact: true })).toHaveCount(0);

  const everyday = groupOf(page, 'Everyday spending');
  const namesOf = () => everyday.getByTestId('category-name').allTextContents();
  expect((await namesOf())[0]).toBe('Groceries');

  await cardOf(page, 'Groceries').click();
  await page.getByRole('button', { name: en['categories.paidClose'] }).click();
  await expect(page.getByTestId('paid-dialog')).toBeVisible();
  await page.getByRole('button', { name: en['categories.paidConfirm'] }).click();

  await expect(page.getByTestId('paid-dialog')).toHaveCount(0);
  await expect(page.getByTestId('category-tile-Groceries')).toHaveAttribute('data-paid', 'true');
  await expect.poll(namesOf).toEqual(['Transport', 'Eating out', 'Other', 'Groceries']);
  await expect(availableOf(page, 'Groceries')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('category-tile-Groceries')).toHaveAttribute('data-paid', 'true');
  await expect(page.getByTestId('reorder-Groceries')).toHaveCount(0);

  await page.getByRole('button', { name: en['categories.nextMonth'] }).click();
  await expect(page.getByTestId('category-tile-Groceries')).not.toHaveAttribute('data-paid');
  await page.getByRole('button', { name: en['categories.previousMonth'] }).click();
  await expect(page.getByTestId('category-tile-Groceries')).toHaveAttribute('data-paid', 'true');

  await cardOf(page, 'Groceries').click();
  await page.getByRole('button', { name: en['categories.paidReopen'] }).click();

  await expect(page.getByTestId('category-tile-Groceries')).not.toHaveAttribute('data-paid');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-base-ui-inert]')).toHaveCount(0);
  await expect.poll(namesOf).toEqual(['Groceries', 'Transport', 'Eating out', 'Other']);
});
