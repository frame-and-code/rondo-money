import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { API_URL } from '../playwright.config';

import { hasClerkKeys, TEST_EMAIL } from './clerk';

// F1.1 DoD scenarios. The test account is created by e2e/global-setup.ts; `clerk.signIn`
// drives Clerk's email-code flow programmatically (fixed OTP, no real emails sent).

// Without Clerk keys the app cannot authenticate anyone. Locally that's a valid partial
// run (fresh clone), so skip; in CI global-setup fails the run outright — see clerk.ts.
test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test('an anonymous visit to a private route lands on the sign-in page', async ({ page }) => {
  await page.goto('/');

  await page.waitForURL('**/sign-in**');
  await expect(page.locator('input[name=identifier]')).toBeVisible();
});

test('signing in shows the app shell; signing out returns to sign-in', async ({ page }) => {
  await setupClerkTestingToken({ page });

  // clerk.signIn needs clerk-js loaded on the current page — the public sign-in route.
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rondo Money' })).toBeVisible();
  // The demo card is rendered by the protected home page — proof the shell is real,
  // not a lookalike heading on a public screen.
  await expect(page.getByText(API_URL)).toBeVisible();
  // F1.4: the page asks the API who is calling, through the generated client. A Clerk user
  // id on screen means the whole chain worked for real — browser token, CORS, the guard's
  // `azp` check, and the typed client — which no unit test with a mocked fetch can show.
  await expect(page.getByText(/^user_/)).toBeVisible();

  await clerk.signOut({ page });
  await page.goto('/');
  await page.waitForURL('**/sign-in**');
});
