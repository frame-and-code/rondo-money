import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { availableOf, cardOf } from './budget';
import { ENTRIES_TEST_EMAIL, FROM_CARD_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
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
  await expect(availableOf(page, CATEGORY)).toContainText('-$25');

  await page.goto('/accounts');
  await page.getByRole('button', { name: PAYEE, exact: true }).click();
  await page.getByRole('button', { name: en['transactions.delete'], exact: true }).click();
  await page.getByRole('button', { name: en['transactions.delete'], exact: true }).click();

  await expect(page.getByRole('listitem').filter({ hasText: PAYEE })).toHaveCount(0);
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');
});

test('an expense added from a category card lands on its default account, and the card shows it', async ({
  page,
}) => {
  await recreateTestUser(FROM_CARD_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: FROM_CARD_TEST_EMAIL },
  });

  await onboard(page);

  await page.goto('/accounts');
  await page.getByRole('button', { name: en['transactions.addAccount'] }).click();
  await page.getByLabel(en['newAccount.nameLabel'], { exact: true }).fill('Cash');
  await page.getByRole('textbox', { name: en['newAccount.balanceLabel'], exact: true }).fill('200');
  await page.getByRole('button', { name: en['accounts.save'] }).click();
  await expect(page.getByTestId('account-panel').getByText('Cash')).toBeVisible();

  await page.goto('/categories');
  await cardOf(page, CATEGORY).click();
  await page.getByRole('button', { name: en['categories.manage'] }).click();
  await page.getByRole('button', { name: en['categories.edit'], exact: true }).click();
  await page.getByRole('combobox', { name: en['categories.defaultAccountLabel'] }).click();
  await page.getByRole('option', { name: 'Cash' }).click();
  await page.getByRole('button', { name: en['categories.save'] }).click();

  await expect(availableOf(page, CATEGORY)).toHaveText('$0');

  await cardOf(page, CATEGORY).click();
  await page.getByRole('button', { name: en['categories.addTransaction'] }).click();

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });

  await expect(form.getByRole('combobox', { name: en['transactions.categoryLabel'] })).toHaveText(
    CATEGORY,
  );
  await expect(form.getByRole('combobox', { name: en['transactions.accountLabel'] })).toContainText(
    'Cash',
  );

  await form.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('25');
  await form.getByRole('button', { name: en['transactions.save'], exact: true }).click();

  await expect(form).toBeHidden();
  await expect(page).toHaveURL(/\/categories/);
  await expect(availableOf(page, CATEGORY)).toHaveText('-$25');

  await page.goto('/accounts');
  await expect(
    page.getByTestId('account-panel').locator('li').filter({ hasText: 'Cash' }),
  ).toContainText('175');
});
