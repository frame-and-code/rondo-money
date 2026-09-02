import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';
import { pl } from '../src/i18n/messages/pl';

import { hasClerkKeys, recreateTestUser, SETTINGS_TEST_EMAIL } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

async function signIn(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: SETTINGS_TEST_EMAIL },
  });
}

test('the language chosen in settings follows the account to another browser', async ({
  browser,
}) => {
  await recreateTestUser(SETTINGS_TEST_EMAIL);

  const first = await browser.newContext({ locale: 'en-US' });
  const page = await first.newPage();
  await signIn(page);
  await onboard(page);

  await page.goto('/settings');
  await page.getByRole('combobox', { name: en['settings.language'] }).click();
  await page.getByRole('option', { name: 'Polski' }).click();

  await expect(page.getByText(pl['settings.theme'], { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByRole('combobox', { name: pl['settings.language'] })).toContainText(
    'Polski',
  );
  await first.close();

  const second = await browser.newContext({ locale: 'en-US' });
  const elsewhere = await second.newPage();
  await signIn(elsewhere);
  await elsewhere.goto('/settings');

  await expect(elsewhere.getByText(pl['settings.theme'], { exact: true })).toBeVisible();
  await expect(elsewhere.locator('html')).toHaveAttribute('lang', 'pl');
  await second.close();
});

test('the theme chosen in settings survives a reload, and stays on this device', async ({
  browser,
}) => {
  await recreateTestUser(SETTINGS_TEST_EMAIL);

  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await signIn(page);
  await onboard(page);

  await page.goto('/settings');
  await page.getByRole('combobox', { name: en['settings.theme'] }).click();
  await page.getByRole('option', { name: en['settings.themeDark'] }).click();

  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  const elsewhere = await browser.newContext({ locale: 'en-US' });
  const other = await elsewhere.newPage();
  await signIn(other);
  await other.goto('/settings');

  await expect(other.getByText(en['settings.themeNote'])).toBeVisible();
  await expect(other.locator('html')).not.toHaveClass(/dark/);
  await elsewhere.close();
  await context.close();
});
