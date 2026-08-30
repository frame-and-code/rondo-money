import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import {
  assign,
  assignedOf,
  cardOf,
  colourOf,
  freeMoney,
  tokenColour,
  turnTheDarkThemeOn,
} from './budget';
import { hasClerkKeys, recreateTestUser, TARGET_TEST_EMAIL } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const CATEGORY = 'Housing';

const badgeOf = (page: Page) => page.getByTestId('target-badge');

const borderOf = (locator: Locator): Promise<string> =>
  locator.evaluate((node) => getComputedStyle(node).borderTopColor);

async function signIn(page: Page): Promise<void> {
  await recreateTestUser(TARGET_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TARGET_TEST_EMAIL },
  });

  await onboard(page);
  await expect(assignedOf(page, CATEGORY)).toBeVisible();
}

async function setGoal(
  page: Page,
  options: { kind: string; amount: string; due?: { month: string; year: string } },
): Promise<void> {
  await cardOf(page, CATEGORY).click();
  await page.getByRole('button', { name: en['categories.manage'] }).click();
  await page.getByRole('button', { name: en['categories.goal'], exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(options.kind) }).click();

  if (options.amount !== '') {
    await page.getByLabel(en['categories.goalAmount']).fill(options.amount);
  }

  if (options.due !== undefined) {
    await page.getByRole('button', { name: en['categories.goalDueMonth'] }).click();
    await page
      .getByRole('combobox', { name: en['common.calendarYear'] })
      .selectOption(options.due.year);
    await page
      .getByRole('combobox', { name: en['common.calendarMonth'] })
      .selectOption(options.due.month);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('grid')).toHaveCount(0);
  }

  await page.getByRole('button', { name: en['categories.save'] }).click();
  await expect(page.getByLabel(en['categories.goalAmount'])).toHaveCount(0);
}

test('a goal asks for the month, says so in colour and in words, and closes when it is covered', async ({
  page,
}) => {
  await signIn(page);

  await setGoal(page, { kind: en['categories.goalContribute'], amount: '300' });

  await expect(badgeOf(page)).toHaveAttribute('data-state', 'short');
  expect(await colourOf(badgeOf(page))).toBe(await tokenColour(page, '--warning'));
  expect(await borderOf(badgeOf(page))).toBe(await colourOf(badgeOf(page)));

  await badgeOf(page).hover();
  await expect(
    page.getByText(en['categories.goalShortfallTip'].replace('{{amount}}', '300 $')),
  ).toBeVisible();

  const free = await freeMoney(page);

  await cardOf(page, CATEGORY).click();
  await expect(
    page.getByLabel(en['categories.moveAmountFor'].replace('{{envelope}}', CATEGORY)),
  ).toHaveValue('300.00');
  await page.getByRole('button', { name: en['categories.moveAssign'] }).click();

  await expect(assignedOf(page, CATEGORY)).toHaveText(/300/);
  await expect(badgeOf(page)).toHaveAttribute('data-state', 'covered');
  await expect.poll(() => freeMoney(page)).not.toBe(free);

  const covered = await colourOf(badgeOf(page));
  expect(covered).toBe(await tokenColour(page, '--success'));
  expect(await borderOf(badgeOf(page))).toBe(covered);

  await turnTheDarkThemeOn(page);
  await expect(badgeOf(page)).toHaveAttribute('data-state', 'covered');
  expect(await colourOf(badgeOf(page))).toBe(await tokenColour(page, '--success'));
  expect(await colourOf(badgeOf(page))).not.toBe(covered);
});

test('a goal with a deadline is recomputed month by month, and a closed one leaves next month', async ({
  page,
}) => {
  await signIn(page);
  await assign(page, '100', CATEGORY);

  await setGoal(page, {
    kind: en['categories.goalByDate'],
    amount: '600',
    due: monthThreeAhead(),
  });

  await page.getByTestId('target-hover').hover();
  const panel = page.getByTestId('target-panel');
  await expect(panel).toBeVisible();
  const thisMonth = await panel.innerText();

  await page.getByRole('button', { name: en['categories.nextMonth'] }).click();
  await page.getByTestId('target-hover').hover();
  await expect(page.getByTestId('target-panel')).not.toHaveText(thisMonth);

  await page.getByRole('button', { name: en['categories.previousMonth'] }).click();
  await setGoal(page, { kind: en['categories.goalNone'], amount: '' });

  await expect(page.getByTestId('target-hover')).toBeVisible();

  await page.getByRole('button', { name: en['categories.nextMonth'] }).click();
  await expect(page.getByTestId('target-hover')).toHaveCount(0);
  await expect(badgeOf(page)).toHaveCount(0);
});

function monthThreeAhead(): { month: string; year: string } {
  const now = new Date();
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));

  return {
    month: at.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
    year: String(at.getUTCFullYear()),
  };
}
