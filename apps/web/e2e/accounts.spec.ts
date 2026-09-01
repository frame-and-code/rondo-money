import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { readyToAssign } from './budget';
import {
  ACCOUNTS_TEST_EMAIL,
  ARCHIVE_TEST_EMAIL,
  hasClerkKeys,
  RECONCILE_TEST_EMAIL,
  recreateTestUser,
} from './clerk';
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

  await panel
    .getByRole('button', { name: en['accounts.actionsFor'].replace('{{name}}', OPENED) })
    .click();
  await page.getByRole('menuitem', { name: en['accounts.rename'] }).click();

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

  const openMenu = async (name: string) =>
    panel
      .getByRole('button', { name: en['accounts.actionsFor'].replace('{{name}}', name) })
      .click();

  await openMenu(ADDED);
  await expect(
    page.getByRole('menuitem', { name: new RegExp(en['accounts.archive']) }),
  ).toBeDisabled();
  await expect(page.getByText(en['accounts.archiveNeedsZero'])).toBeVisible();
  await page.keyboard.press('Escape');

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

  await openMenu(ADDED);
  await page.getByRole('menuitem', { name: en['accounts.archive'], exact: true }).click();
  await page.getByRole('button', { name: en['accounts.archiveConfirm'] }).click();

  await expect(panel.getByText(ADDED)).toHaveCount(0);
  await expect(page.getByTestId('accounts-total')).toContainText('1,250');
});

test('a declared balance settles the difference, and the pool follows it', async ({ page }) => {
  await recreateTestUser(RECONCILE_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: RECONCILE_TEST_EMAIL },
  });

  await onboard(page);
  await expect(readyToAssign(page)).toHaveText('1,000 $');

  await page.goto('/accounts');

  const panel = page.getByTestId('account-panel');
  await expect(panel.getByText(OPENED)).toBeVisible();

  await panel.getByRole('button', { name: OPENED, exact: true }).click();
  await page.getByRole('button', { name: en['accounts.reconcile'] }).click();

  const form = page.getByRole('dialog');
  await expect(form.getByText(en['accounts.reconcileComputed'])).toBeVisible();

  await form.getByLabel(en['accounts.reconcileLabel'], { exact: true }).fill('880');
  await expect(
    form.getByText(en['accounts.reconcileWillWrite'].replace('{{amount}}', '-120 $')),
  ).toBeVisible();

  await page.getByRole('button', { name: en['accounts.reconcileConfirm'] }).click();

  await expect(form).toBeHidden();
  await expect(page.getByTestId('accounts-total')).toContainText('880');
  await expect(page.getByText(en['transactions.adjustment'])).toBeVisible();

  await page.getByRole('link', { name: en['nav.categories'] }).click();
  await expect(readyToAssign(page)).toHaveText('880 $');
});
