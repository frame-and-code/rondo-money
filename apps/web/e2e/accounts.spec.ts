import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { ACCOUNTS_TEST_EMAIL, ARCHIVE_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const OPENED = 'Main card';
const ADDED = 'Cash jar';
const RENAMED = 'Everyday';

test('the accounts screen carries the balances, takes another account and renames one', async ({
  page,
}) => {
  await recreateTestUser(ACCOUNTS_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: ACCOUNTS_TEST_EMAIL },
  });

  await onboard(page);
  await page.goto('/accounts');

  const panel = page.getByTestId('account-panel');

  await expect(panel.getByText(OPENED)).toBeVisible();
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');

  await page.getByRole('button', { name: en['transactions.addAccount'] }).click();
  await page.getByLabel(en['newAccount.nameLabel'], { exact: true }).fill(ADDED);
  await page.getByLabel(en['newAccount.balanceLabel'], { exact: true }).fill('250');
  await page.getByRole('button', { name: en['accounts.save'] }).click();

  await expect(panel.getByText(ADDED)).toBeVisible();
  await expect(page.getByTestId('accounts-total')).toContainText('1,250');

  await page
    .getByRole('button', { name: en['accounts.renameOne'].replace('{{name}}', OPENED) })
    .click();

  const field = page.getByLabel(en['newAccount.nameLabel'], { exact: true });
  await field.fill(RENAMED);
  await page.getByRole('button', { name: en['accounts.save'] }).click();

  await expect(panel.getByText(RENAMED)).toBeVisible();
  await expect(panel.getByText(OPENED)).toHaveCount(0);
  await expect(page.getByTestId('accounts-total')).toContainText('1,250');
});

test('an account is archived once it holds nothing, and leaves the screen for good', async ({
  page,
}) => {
  await recreateTestUser(ARCHIVE_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: ARCHIVE_TEST_EMAIL },
  });

  await onboard(page);
  await page.goto('/accounts');

  const panel = page.getByTestId('account-panel');

  await page.getByRole('button', { name: en['transactions.addAccount'] }).click();
  await page.getByLabel(en['newAccount.nameLabel'], { exact: true }).fill(ADDED);
  await page.getByLabel(en['newAccount.balanceLabel'], { exact: true }).fill('250');
  await page.getByRole('button', { name: en['accounts.save'] }).click();

  await expect(panel.getByText(ADDED)).toBeVisible();
  await expect(page.getByTestId('accounts-total')).toContainText('1,250');

  const openRename = async (name: string) =>
    panel.getByRole('button', { name: en['accounts.renameOne'].replace('{{name}}', name) }).click();

  await openRename(ADDED);
  await expect(page.getByRole('button', { name: en['accounts.archive'] })).toBeDisabled();
  await expect(page.getByText(en['accounts.archiveNeedsZero'])).toBeVisible();
  await page.getByRole('button', { name: en['accounts.cancel'] }).click();

  await panel.getByRole('button', { name: ADDED, exact: true }).click();
  await page.getByRole('button', { name: en['transactions.add'] }).click();

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });

  await form.getByRole('button', { name: en['transactions.kindTransfer'], exact: true }).click();
  await form.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('250');
  await form.getByRole('combobox', { name: en['transactions.toAccountLabel'] }).click();
  await page.getByRole('option', { name: new RegExp(OPENED) }).click();
  await form.getByRole('button', { name: en['transactions.save'], exact: true }).click();

  await expect(form).toBeHidden();
  await expect(panel.locator('li').filter({ hasText: ADDED })).not.toContainText('250');

  await openRename(ADDED);
  await expect(page.getByRole('button', { name: en['accounts.archive'] })).toBeEnabled();
  await page.getByRole('button', { name: en['accounts.archive'] }).click();
  await page.getByRole('button', { name: en['accounts.archiveConfirm'] }).click();

  await expect(panel.getByText(ADDED)).toHaveCount(0);
  await expect(page.getByTestId('accounts-total')).toContainText('1,250');
});
