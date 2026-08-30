import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { assign, assignedOf, availableOf, freeMoney, moveTo } from './budget';
import { BUDGET_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const CATEGORY = 'Housing';

test('money is distributed across months, a future one included', async ({ page }) => {
  await recreateTestUser(BUDGET_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: BUDGET_TEST_EMAIL },
  });

  await onboard(page);
  await expect(assignedOf(page, CATEGORY)).toBeVisible();

  const free = await freeMoney(page);
  const thisMonth = new URL(page.url()).searchParams.get('month');

  await assign(page, '120', CATEGORY);

  await expect(assignedOf(page, CATEGORY)).toHaveText('120 $');
  await expect(availableOf(page, CATEGORY)).toHaveText('120 $');
  await expect.poll(() => freeMoney(page)).not.toBe(free);
  const afterFirst = await freeMoney(page);

  await page.getByRole('button', { name: en['categories.nextMonth'] }).click();

  await expect(assignedOf(page, CATEGORY)).toHaveText('0 $');
  await expect(availableOf(page, CATEGORY)).toHaveText('120 $');
  await expect.poll(() => freeMoney(page)).toBe(afterFirst);
  expect(new URL(page.url()).searchParams.get('month')).not.toBe(thisMonth);

  await page.goBack();
  await expect(assignedOf(page, CATEGORY)).toHaveText('120 $');

  await page.goForward();
  await expect(assignedOf(page, CATEGORY)).toHaveText('0 $');
  await expect(page.getByText(en['categories.futureMonth'])).toBeVisible();

  await assign(page, '50', CATEGORY);

  await expect(assignedOf(page, CATEGORY)).toHaveText('50 $');
  await expect.poll(() => freeMoney(page)).not.toBe(afterFirst);
  const afterFuture = await freeMoney(page);

  await page.getByRole('button', { name: en['categories.previousMonth'] }).click();

  await expect(assignedOf(page, CATEGORY)).toHaveText('120 $');
  await expect.poll(() => freeMoney(page)).toBe(afterFuture);

  await moveTo(page, { from: CATEGORY, to: en['categories.readyToAssign'], amount: '150' });

  await expect(assignedOf(page, CATEGORY)).toHaveText('-30 $');
  await expect.poll(() => freeMoney(page)).not.toBe(afterFuture);
});
