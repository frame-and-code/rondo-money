import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';

import { pl } from '../src/i18n/messages/pl';

import { hasClerkKeys, LOCALE_TEST_EMAIL } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

async function openFirstStep(context: BrowserContext) {
  const page = await context.newPage();
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: LOCALE_TEST_EMAIL },
  });
  await page.goto('/new');

  return page;
}

test('the language of the first sign-in follows the account to another browser', async ({
  browser,
}) => {
  const polish = await browser.newContext({ locale: 'pl-PL' });
  const firstVisit = await openFirstStep(polish);
  await expect(firstVisit.getByRole('heading', { name: pl['newBudget.heading'] })).toBeVisible();
  await polish.close();

  const english = await browser.newContext({ locale: 'en-US' });
  const secondVisit = await openFirstStep(english);
  await expect(secondVisit.getByRole('heading', { name: pl['newBudget.heading'] })).toBeVisible();
  await expect(secondVisit.locator('html')).toHaveAttribute('lang', 'pl');
  await english.close();
});
