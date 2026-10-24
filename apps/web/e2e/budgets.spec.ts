import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { assign, assignedOf, availableOf, readyToAssign } from './budget';
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

  await page.getByRole('button', { name: en['settings.budgetNew'] }).click();
  await page.getByRole('link', { name: en['settings.budgetNewClean'] }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();
  await expect(page.getByRole('combobox', { name: en['newBudget.languageLabel'] })).toHaveCount(0);

  await page.getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true }).fill('Trip');
  await page.getByRole('combobox', { name: en['newBudget.currencyLabel'] }).click();
  await page.getByPlaceholder(en['newBudget.searchPlaceholder']).fill('EUR');
  await page.getByRole('option', { name: /EUR/ }).click();

  const submit = page.getByRole('button', { name: en['newBudget.submit'] });
  await expect(page.getByRole('checkbox', { name: en['newBudget.consentLabel'] })).toBeChecked();
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

test('a budget started from the current one carries its structure and none of its money, then takes its opening balances', async ({
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

  await assign(page, '120', 'Housing');
  await expect(assignedOf(page, 'Housing')).toHaveText(/120/);
  await expect(readyToAssign(page)).toHaveText(/880/);
  const categories = await page.getByTestId('category-name').allTextContents();
  expect(categories.length).toBeGreaterThan(0);

  await page.goto('/settings');
  await page.getByRole('button', { name: en['settings.budgetNew'] }).click();
  await page.getByRole('link', { name: en['settings.budgetNewFrom'] }).click();

  await expect(page).toHaveURL(/\/new\?from=/);
  await expect(page.getByRole('combobox', { name: en['newBudget.templateLabel'] })).toContainText(
    'Household',
  );
  await expect(page.getByRole('combobox', { name: en['newBudget.currencyLabel'] })).toContainText(
    'USD',
  );
  await expect(page.getByText(en['newBudget.templateConsentHint'])).toBeVisible();

  await page
    .getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true })
    .fill('Next year');
  const submit = page.getByRole('button', { name: en['newBudget.submit'] });
  await expect(page.getByRole('checkbox', { name: en['newBudget.consentLabel'] })).toBeChecked();
  await submit.click();

  await page.getByRole('link', { name: en['newBudget.balances'] }).click();
  await expect(page).toHaveURL(/\/new\/balances$/);
  const opening = page.getByLabel('Main card', { exact: true });
  await expect(opening).toHaveValue('');
  await opening.fill('250');
  await page.getByRole('button', { name: en['balances.submit'] }).click();

  await expect(page).toHaveURL(/\/categories/);
  await expect(readyToAssign(page)).toBeVisible();

  const exactly250 = /^\D*250(\.00)?\D*$/;
  await expect(page.getByTestId('category-name')).toHaveText(categories);
  await expect(readyToAssign(page)).toHaveText(exactly250);
  for (const amount of [assignedOf(page, 'Housing'), availableOf(page, 'Housing')]) {
    await expect(amount).toHaveText(/0/);
    await expect(amount).not.toHaveText(/[1-9]/);
  }

  await page.goto('/accounts');
  await expect(page.getByText('Main card').first()).toBeVisible();
  await expect(page.getByTestId('accounts-total')).toHaveText(exactly250);

  await page.goto('/settings');
  await expect(nameField(page)).toHaveValue('Next year');
  await expect(budgetList(page).getByRole('listitem')).toHaveCount(2);
  await expect(budgetList(page).getByText('Household', { exact: true })).toBeVisible();
});
