import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { freeMoney } from './budget';
import { hasClerkKeys, recreateTestUser, TRANSFER_TEST_EMAIL } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const SAVINGS = 'Savings';

const OPENED = 'Main card';

test('money moves between two accounts, changes amount, and comes back when the transfer goes', async ({
  page,
}) => {
  await recreateTestUser(TRANSFER_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TRANSFER_TEST_EMAIL },
  });

  await onboard(page);

  await page.goto('/categories');
  const pool = await freeMoney(page);

  await page.goto('/accounts');
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');

  await page.getByRole('button', { name: en['transactions.addAccount'] }).click();
  await page.getByLabel(en['newAccount.nameLabel'], { exact: true }).fill(SAVINGS);
  await page.getByLabel(en['newAccount.balanceLabel'], { exact: true }).fill('0');
  await page.getByRole('button', { name: en['accounts.save'] }).click();

  const panel = page.getByTestId('account-panel');
  await expect(panel.getByText(SAVINGS)).toBeVisible();

  const rowOf = (name: string) => panel.locator('li').filter({ hasText: name });

  await page.getByRole('button', { name: en['transactions.add'] }).click();

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });

  await form.getByRole('button', { name: en['transactions.kindTransfer'], exact: true }).click();
  await form.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('250');
  await form.getByRole('combobox', { name: en['transactions.toAccountLabel'] }).click();
  await page.getByRole('option', { name: new RegExp(SAVINGS) }).click();
  await form.getByRole('button', { name: en['transactions.save'], exact: true }).click();

  await expect(form).toBeHidden();

  const legs = page.getByRole('listitem').filter({ hasText: en['transactions.transferBadge'] });

  await expect(legs).toHaveCount(2);
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');
  await expect(rowOf(OPENED)).toContainText('750');
  await expect(rowOf(SAVINGS)).toContainText('250');

  await page.goto('/categories');
  await expect.poll(() => freeMoney(page)).toBe(pool);

  await page.goto('/accounts');
  await legs.first().click();

  const editing = page.getByRole('dialog', { name: en['transactions.editTitle'], exact: true });

  await editing.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('400');
  await editing.getByRole('button', { name: en['transactions.save'], exact: true }).click();

  await expect(editing).toBeHidden();
  await expect(rowOf(OPENED)).toContainText('600');
  await expect(rowOf(SAVINGS)).toContainText('400');

  await legs.first().click();
  await editing.getByRole('button', { name: en['transactions.delete'], exact: true }).click();
  await page.getByRole('button', { name: en['transactions.delete'], exact: true }).last().click();

  await expect(legs).toHaveCount(0);
  await expect(rowOf(OPENED)).toContainText('1,000');
  await expect(rowOf(SAVINGS)).toContainText('0');
});
