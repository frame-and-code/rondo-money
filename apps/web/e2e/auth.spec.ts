import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { API_URL } from '../playwright.config';

import { hasClerkKeys, TEST_EMAIL } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test('an anonymous visit to a private route lands on the sign-in page', async ({ page }) => {
  await page.goto('/');

  await page.waitForURL('**/sign-in**');
  await expect(page.locator('input[name=identifier]')).toBeVisible();
});

test('signing in shows the app shell; signing out returns to sign-in', async ({ page }) => {
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rondo Money' })).toBeVisible();
  await expect(page.getByText(API_URL)).toBeVisible();
  await expect(page.getByText(/^user_/)).toBeVisible();

  await clerk.signOut({ page });
  await page.goto('/');
  await page.waitForURL('**/sign-in**');
});
