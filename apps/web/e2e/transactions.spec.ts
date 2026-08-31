import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { availableOf } from './budget';
import { ENTRIES_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const CATEGORY = 'Groceries';

const PAYEE = 'Corner cafe';

test('an expense is recorded on the screen, lands in its envelope, and can be taken back', async ({
  page,
}) => {
  await recreateTestUser(ENTRIES_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: ENTRIES_TEST_EMAIL },
  });

  await onboard(page);

  await page.goto('/accounts');
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');

  await page.getByRole('button', { name: en['transactions.add'] }).click();

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });

  await form.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('25');
  await form.getByRole('combobox', { name: en['transactions.categoryLabel'], exact: true }).click();
  await page.getByRole('option', { name: CATEGORY, exact: true }).click();
  await form.getByRole('combobox', { name: en['transactions.payeeExpense'], exact: true }).click();
  await page.getByPlaceholder(en['transactions.payeeHintExpense']).fill(PAYEE);
  await page
    .getByRole('option', { name: en['transactions.payeeAdd'].replace('{{name}}', PAYEE) })
    .click();
  await form.getByRole('button', { name: en['transactions.save'], exact: true }).click();

  await expect(form).toBeHidden();

  const written = page.getByRole('listitem').filter({ hasText: PAYEE });

  await expect(written).toBeVisible();
  await expect(page.getByTestId('accounts-total')).toContainText('975');

  await page.goto('/categories');
  await expect(availableOf(page, CATEGORY)).toContainText('-25');

  await page.goto('/accounts');
  await page
    .getByRole('button', { name: en['transactions.deleteOne'].replace('{{payee}}', PAYEE) })
    .click();
  await page.getByRole('menuitem', { name: en['transactions.delete'] }).click();
  await page.getByRole('button', { name: en['transactions.delete'], exact: true }).click();

  await expect(page.getByRole('listitem').filter({ hasText: PAYEE })).toHaveCount(0);
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');
});
