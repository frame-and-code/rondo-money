import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { hasClerkKeys, recreateTestUser, SWITCH_TEST_EMAIL } from './clerk';
import { onboard, submitAccount } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const activateNamed = (name: string): string =>
  en['settings.budgetActivateNamed'].replace('{{name}}', name);

const budgetList = (page: Page) => page.getByRole('list', { name: en['settings.budgets'] });

const nameField = (page: Page) =>
  page.getByRole('textbox', { name: en['settings.budgetName'], exact: true });

async function expectAccounts(page: Page, shown: string, hidden: string): Promise<void> {
  await page.goto('/accounts');

  await expect(page.getByText(shown).first()).toBeVisible();
  await expect(page.getByText(hidden)).toHaveCount(0);
}

test('a second budget takes over every screen, and the first comes back from settings', async ({
  page,
}) => {
  await recreateTestUser(SWITCH_TEST_EMAIL);
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: SWITCH_TEST_EMAIL },
  });
  await onboard(page);

  await page.goto('/settings');
  await expect(nameField(page)).toHaveValue('Household');
  await nameField(page).fill('Home');
  await page.getByRole('button', { name: en['settings.budgetSave'] }).click();
  await expect(budgetList(page).getByText('Home', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: en['settings.budgetNew'] }).click();
  await expect(page.getByRole('heading', { name: en['newBudget.secondHeading'] })).toBeVisible();
  await expect(page.getByRole('combobox', { name: en['newBudget.languageLabel'] })).toHaveCount(0);

  await page.getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true }).fill('Trip');
  await page.getByRole('combobox', { name: en['newBudget.currencyLabel'] }).click();
  await page.getByPlaceholder(en['newBudget.searchPlaceholder']).fill('EUR');
  await page.getByRole('option', { name: /EUR/ }).click();

  const submit = page.getByRole('button', { name: en['newBudget.submit'] });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox', { name: en['newBudget.consentLabel'] }).click();
  await submit.click();

  await page.getByRole('link', { name: en['newBudget.continue'] }).click();
  await expect(page.getByRole('heading', { name: en['newAccount.heading'] })).toBeVisible();
  await submitAccount(page, 'Trip card');

  await expectAccounts(page, 'Trip card', 'Main card');

  await page.goto('/settings');
  await expect(nameField(page)).toHaveValue('Trip');
  await expect(budgetList(page).getByRole('listitem')).toHaveCount(2);

  await page.evaluate(() => {
    document.documentElement.dataset['beforeTheSwitch'] = 'yes';
  });
  await page.getByRole('radio', { name: activateNamed('Home') }).click();
  await page.getByRole('button', { name: en['settings.budgetSwitchConfirm'] }).click();

  await expect(nameField(page)).toHaveValue('Home');
  await expect(page.getByRole('radio', { name: activateNamed('Trip') })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.locator('html[data-before-the-switch]')).toHaveCount(1);

  await expectAccounts(page, 'Main card', 'Trip card');
});
