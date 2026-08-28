import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { assign, assignedOf, availableOf, freeMoney, moveTo, readyToAssign } from './budget';
import { hasClerkKeys, MOVE_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const FROM = 'Housing';
const TO = 'Utilities';

test('money moves between envelopes without leaving the screen', async ({ page }) => {
  await recreateTestUser(MOVE_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: MOVE_TEST_EMAIL },
  });

  await onboard(page);
  await expect(availableOf(page, FROM)).toBeVisible();

  await assign(page, '120', FROM);
  await assign(page, '80', TO);

  await expect(availableOf(page, FROM)).toHaveText('$120.00');
  await expect(availableOf(page, TO)).toHaveText('$80.00');

  const beforeCategories = await freeMoney(page);

  await moveTo(page, { from: FROM, to: TO, amount: '30' });

  await expect(availableOf(page, FROM)).toHaveText('$90.00');
  await expect(availableOf(page, TO)).toHaveText('$110.00');
  expect(await freeMoney(page)).toBe(beforeCategories);

  await moveTo(page, { from: FROM, to: en['categories.readyToAssign'], amount: '200' });

  await expect(availableOf(page, FROM)).toHaveText('-$110.00');
  await expect(assignedOf(page, FROM)).toHaveText('-$110.00');
  await expect(readyToAssign(page)).toHaveText('$1,000.00');
});
