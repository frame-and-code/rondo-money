import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';
import { pl } from '../src/i18n/messages/pl';

import { BUDGET_TEST_EMAIL, hasClerkKeys } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test('a new user picks a language, finds a currency and creates a budget', async ({ page }) => {
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: BUDGET_TEST_EMAIL },
  });

  await page.goto('/new');

  // The browser asks for English, so the screen starts there and the switch is a real change.
  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();

  await page.getByRole('combobox', { name: en['newBudget.languageLabel'] }).click();
  await page.getByRole('option', { name: 'Polski' }).click();
  await expect(page.getByRole('heading', { name: pl['newBudget.heading'] })).toBeVisible();

  await page.getByLabel(pl['newBudget.nameLabel']).fill('Budżet domowy');

  await page.getByRole('combobox', { name: pl['newBudget.currencyLabel'] }).click();
  await page.getByPlaceholder(pl['newBudget.searchPlaceholder']).fill('PLN');
  await page.getByRole('option', { name: /PLN/ }).click();

  const submit = page.getByRole('button', { name: pl['newBudget.submit'] });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(
    page.getByText(pl['newBudget.doneTitle'].replace('{{name}}', 'Budżet domowy')),
  ).toBeVisible();
});
