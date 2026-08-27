import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { BUDGET_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const CATEGORY = 'Housing';

const assignedOf = (page: Page, category = CATEGORY) =>
  page.getByRole('button', {
    name: en['categories.assignEdit'].replace('{{category}}', category),
  });

const readyToAssign = (page: Page) => page.getByTestId('ready-to-assign');

const freeMoney = async (page: Page): Promise<string> =>
  (await readyToAssign(page).innerText()).replace(/\s+/gu, ' ').trim();

const availableOf = (page: Page, category = CATEGORY) => page.getByTestId(`available-${category}`);

async function assign(page: Page, amount: string, category = CATEGORY): Promise<void> {
  await assignedOf(page, category).click();
  await page.getByLabel(en['categories.assignField']).fill(amount);
  await page.getByRole('button', { name: en['categories.assignSave'] }).click();
  await expect(page.getByLabel(en['categories.assignField'])).toHaveCount(0);
}

test('money is distributed across months, a future one included', async ({ page }) => {
  await recreateTestUser(BUDGET_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: BUDGET_TEST_EMAIL },
  });

  await onboard(page);
  await expect(assignedOf(page)).toBeVisible();

  const free = await freeMoney(page);
  const thisMonth = new URL(page.url()).searchParams.get('month');

  await assign(page, '120');

  await expect(assignedOf(page)).toHaveText('$120.00');
  await expect(availableOf(page)).toHaveText('$120.00');
  await expect.poll(() => freeMoney(page)).not.toBe(free);
  const afterFirst = await freeMoney(page);

  await page.getByRole('button', { name: en['categories.nextMonth'] }).click();

  await expect(assignedOf(page)).toHaveText('$0.00');
  await expect(availableOf(page)).toHaveText('$120.00');
  await expect.poll(() => freeMoney(page)).toBe(afterFirst);
  expect(new URL(page.url()).searchParams.get('month')).not.toBe(thisMonth);

  await page.goBack();
  await expect(assignedOf(page)).toHaveText('$120.00');

  await page.goForward();
  await expect(assignedOf(page)).toHaveText('$0.00');
  await expect(page.getByText(en['categories.futureMonth'])).toBeVisible();

  await assign(page, '50');

  await expect(assignedOf(page)).toHaveText('$50.00');
  await expect.poll(() => freeMoney(page)).not.toBe(afterFirst);
  const afterFuture = await freeMoney(page);

  await page.getByRole('button', { name: en['categories.previousMonth'] }).click();

  await expect(assignedOf(page)).toHaveText('$120.00');
  await expect.poll(() => freeMoney(page)).toBe(afterFuture);

  await assign(page, '-30');

  await expect(assignedOf(page)).toHaveText('-$30.00');
  await expect.poll(() => freeMoney(page)).not.toBe(afterFuture);
});
