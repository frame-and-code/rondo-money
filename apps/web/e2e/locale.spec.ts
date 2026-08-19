import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';

import { pl } from '../src/i18n/messages/pl';

import { hasClerkKeys, LOCALE_TEST_EMAIL } from './clerk';

// F1.6 DoD: the interface renders in the language held in the user's settings, which the API
// created from the browser that first signed in.
//
// Without Clerk keys the app cannot authenticate anyone. Locally that's a valid partial run
// (fresh clone), so skip; in CI global-setup fails the run outright — see clerk.ts.
test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

/** Signs the locale account in and lands on the home page. */
async function openHomePage(context: BrowserContext) {
  const page = await context.newPage();
  await setupClerkTestingToken({ page });

  // clerk.signIn needs clerk-js loaded on the current page — the public sign-in route.
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: LOCALE_TEST_EMAIL },
  });
  await page.goto('/');

  return page;
}

test('the language of the first sign-in follows the account to another browser', async ({
  browser,
}) => {
  // A Polish browser sends `Accept-Language: pl-PL`, which is all the API has to go on the
  // first time this account appears: it creates the settings row and stores `pl`.
  const polish = await browser.newContext({ locale: 'pl-PL' });
  const firstVisit = await openHomePage(polish);
  await expect(firstVisit.getByText(pl['home.demoTitle'])).toBeVisible();
  await polish.close();

  // Another browser, another machine — an English one, with no stored choice of its own. If
  // the interface still came from the browser it would be English here; it is Polish because
  // the app now reads the account's settings, which is the whole of F1.6 in one assertion.
  const english = await browser.newContext({ locale: 'en-US' });
  const secondVisit = await openHomePage(english);
  await expect(secondVisit.getByText(pl['home.demoTitle'])).toBeVisible();
  await expect(secondVisit.locator('html')).toHaveAttribute('lang', 'pl');
  await english.close();
});
