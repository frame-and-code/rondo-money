import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { localeLabels } from '../src/i18n/locales';
import { en } from '../src/i18n/messages/en';
import { pl } from '../src/i18n/messages/pl';

import {
  FINISHED_TEST_EMAIL,
  hasClerkKeys,
  ONBOARDING_TEST_EMAIL,
  recreateTestUser,
  RESUME_TEST_EMAIL,
} from './clerk';
import { onboard, submitBudget } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

async function signInAsFresh(page: Page, email: string) {
  await recreateTestUser(email);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: email } });
}

test('a new user is taken through setup and lands in the app', async ({ page }) => {
  await signInAsFresh(page, ONBOARDING_TEST_EMAIL);

  await page.goto('/categories');
  await expect(page).toHaveURL(/\/new$/);

  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();

  await page.getByRole('combobox', { name: en['newBudget.languageLabel'] }).click();
  await page.getByRole('option', { name: localeLabels.pl }).click();
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
  await expect(page).toHaveURL(/\/new$/);

  await page.getByRole('link', { name: pl['newBudget.continue'] }).click();

  await expect(page.getByRole('heading', { name: pl['newAccount.heading'] })).toBeVisible();

  await page.getByLabel(pl['newAccount.nameLabel']).fill('Portfel');
  await page.getByRole('button', { name: new RegExp(pl['newAccount.typeCash']) }).click();
  await page.getByLabel(pl['newAccount.balanceLabel']).fill('1250,50');

  const finish = page.getByRole('button', { name: pl['newAccount.submit'] });
  await expect(finish).toBeEnabled();
  await finish.click();

  await expect(page.getByText(pl['newAccount.startAssigning'])).toBeVisible();
  await expect(page).toHaveURL(/\/new\/account$/);

  await page.getByRole('link', { name: pl['nav.categories'] }).click();

  await expect(page.getByText(pl['categories.slotTitle'])).toBeVisible();
});

test('a user who finished setup cannot open the wizard again', async ({ page }) => {
  await signInAsFresh(page, FINISHED_TEST_EMAIL);
  await onboard(page);

  const steps = [
    { address: '/new', heading: en['newBudget.heading'] },
    { address: '/new/account', heading: en['newAccount.heading'] },
  ];

  for (const step of steps) {
    await page.goto(step.address);

    await expect(page).toHaveURL(/\/categories$/);
    await expect(page.getByRole('heading', { name: step.heading })).toBeHidden();
    await expect(page.getByText(en['categories.slotTitle'])).toBeVisible();
  }
});

test('setup broken off after the budget resumes at the account step', async ({ page }) => {
  await signInAsFresh(page, RESUME_TEST_EMAIL);

  await page.goto('/new');
  await submitBudget(page);

  for (const address of ['/', '/categories', '/new']) {
    await page.goto(address);

    await expect(page).toHaveURL(/\/new\/account$/);
    await expect(page.getByRole('heading', { name: en['newAccount.heading'] })).toBeVisible();
  }
});
