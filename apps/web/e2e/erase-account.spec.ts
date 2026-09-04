import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import {
  ERASE_TEST_EMAIL,
  hasClerkKeys,
  hasTestUser,
  recreateTestUser,
  RESET_TEST_EMAIL,
} from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

async function signIn(page: Page, email: string): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: email } });
}

async function confirmInTheDialog(page: Page, phrase: string, button: string): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill(phrase);
  await dialog.getByRole('button', { name: button }).click();
}

test('erasing the data returns the reader to the budget form, still signed in', async ({
  browser,
}) => {
  await recreateTestUser(RESET_TEST_EMAIL);

  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await signIn(page, RESET_TEST_EMAIL);
  await onboard(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: en['settings.reset'] }).click();
  await confirmInTheDialog(page, en['settings.resetPhrase'], en['settings.resetConfirm']);

  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();
  await expect(hasTestUser(RESET_TEST_EMAIL)).resolves.toBe(true);
  await context.close();
});

test('deleting the account takes the account with it', async ({ browser }) => {
  await recreateTestUser(ERASE_TEST_EMAIL);

  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await signIn(page, ERASE_TEST_EMAIL);
  await onboard(page);

  await page.goto('/settings');
  await page.getByRole('button', { name: en['settings.delete'] }).click();
  await confirmInTheDialog(page, en['settings.deletePhrase'], en['settings.deleteConfirm']);

  await expect(page).toHaveURL(/\/sign-in/);
  await expect.poll(() => hasTestUser(ERASE_TEST_EMAIL)).toBe(false);
  await context.close();
});
