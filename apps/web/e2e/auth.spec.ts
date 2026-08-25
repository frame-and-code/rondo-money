import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { hasClerkKeys, TEST_EMAIL } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test('an anonymous visit to a private route lands on the sign-in page', async ({ page }) => {
  await page.goto('/');

  await page.waitForURL('**/sign-in**');
  await expect(page.locator('input[name=identifier]')).toBeVisible();
});

test('an anonymous visit to any section lands on the sign-in page', async ({ page }) => {
  for (const route of ['/categories', '/accounts', '/net-worth', '/settings']) {
    await page.goto(route);
    await page.waitForURL('**/sign-in**');
  }
});

test('signing in opens setup; signing out returns to sign-in', async ({ page }) => {
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  // This account never creates anything, so it is always a user whose setup has not started.
  await page.goto('/');
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();

  await clerk.signOut({ page });
  await page.goto('/');
  await page.waitForURL('**/sign-in**');
});
