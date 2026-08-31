import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { ACCOUNTS_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
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
