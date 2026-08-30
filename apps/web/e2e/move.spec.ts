import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import {
  assign,
  assignedOf,
  availableOf,
  colourOf,
  freeMoney,
  moveTo,
  readyToAssign,
  tokenColour,
  turnTheDarkThemeOn,
} from './budget';
import { hasClerkKeys, MOVE_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const FROM = 'Housing';
const TO = 'Utilities';

test('money moves between envelopes, and what fell below zero says so in both themes', async ({
  page,
}) => {
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

  await expect(availableOf(page, FROM)).toHaveText('120 $');
  await expect(availableOf(page, TO)).toHaveText('80 $');

  const beforeCategories = await freeMoney(page);

  await moveTo(page, { from: FROM, to: TO, amount: '30' });

  await expect(availableOf(page, FROM)).toHaveText('90 $');
  await expect(availableOf(page, TO)).toHaveText('110 $');
  expect(await freeMoney(page)).toBe(beforeCategories);

  await moveTo(page, { from: FROM, to: en['categories.readyToAssign'], amount: '200' });

  await expect(availableOf(page, FROM)).toHaveText('-110 $');
  await expect(assignedOf(page, FROM)).toHaveText('-110 $');
  await expect(readyToAssign(page)).toHaveText('1,000 $');

  const light = await tokenColour(page, '--destructive');

  expect(await colourOf(availableOf(page, FROM))).toBe(light);
  expect(await colourOf(assignedOf(page, FROM))).toBe(light);
  expect(await colourOf(availableOf(page, TO))).not.toBe(light);

  await assign(page, '1200', TO);

  await expect(readyToAssign(page)).toHaveText('-200 $');
  await expect(page.getByText(en['categories.readyToAssignOver'])).toBeVisible();

  expect(await colourOf(readyToAssign(page))).toBe(light);
  expect(await colourOf(page.getByText(en['categories.readyToAssignOver']))).toBe(light);

  await turnTheDarkThemeOn(page);

  const dark = await tokenColour(page, '--destructive');

  expect(dark).not.toBe(light);
  expect(await colourOf(availableOf(page, FROM))).toBe(dark);
  expect(await colourOf(readyToAssign(page))).toBe(dark);
  expect(await colourOf(availableOf(page, TO))).not.toBe(dark);
});
