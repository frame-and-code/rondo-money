import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { availableOf, cardOf, readyToAssign } from './budget';
import {
  hasClerkKeys,
  KEYBOARD_ENTRY_TEST_EMAIL,
  KEYBOARD_TEST_EMAIL,
  recreateTestUser,
} from './clerk';
import { expectVisibleFocus, reach } from './keyboard';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const amountFor = (envelope: string) =>
  en['categories.moveAmountFor'].replace('{{envelope}}', envelope);

test('setup, assigning, moving money and a record all work from the keyboard alone, with the focus in sight', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await recreateTestUser(KEYBOARD_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: KEYBOARD_TEST_EMAIL },
  });

  await page.goto('/categories');
  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();

  const budgetName = page.getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true });
  await reach(page, budgetName);
  await page.keyboard.type('Household');

  const currency = page.getByRole('combobox', { name: en['newBudget.currencyLabel'] });
  await reach(page, currency);
  await page.keyboard.press('Enter');
  await page.keyboard.type('USD');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(currency).toContainText('USD');

  const createBudget = page.getByRole('button', { name: en['newBudget.submit'] });
  await reach(page, createBudget);
  await page.keyboard.press('Enter');

  const onward = page.getByRole('link', { name: en['newBudget.continue'] });
  await reach(page, onward);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: en['newAccount.heading'] })).toBeVisible();

  const accountName = page.getByRole('textbox', { name: en['newAccount.nameLabel'], exact: true });
  await reach(page, accountName);
  await page.keyboard.type('Wallet');

  const debit = page.getByRole('radio', { name: new RegExp(en['newAccount.typeDebit']) });
  const cash = page.getByRole('radio', { name: new RegExp(en['newAccount.typeCash']) });
  await reach(page, debit);
  await page.keyboard.press('ArrowRight');
  await expect(cash).toBeChecked();
  await expectVisibleFocus(cash);

  const balance = page.getByLabel(en['newAccount.balanceLabel'], { exact: true });
  await reach(page, balance);
  await page.keyboard.type('1000');

  const addAccount = page.getByRole('button', { name: en['newAccount.submit'] });
  await reach(page, addAccount);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/categories$/);
  await expect(readyToAssign(page)).toContainText('$1,000');

  const housing = cardOf(page, 'Housing');
  await reach(page, housing);
  await page.keyboard.press('Enter');

  const housingAmount = page.getByLabel(amountFor('Housing'));
  await expect(housingAmount).toBeFocused();
  await page.keyboard.type('120');
  await page.keyboard.press('Enter');

  await expect(availableOf(page, 'Housing')).toHaveText('$120');
  await expect(housingAmount).toHaveCount(0);

  await reach(page, housing);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(amountFor('Housing'))).toBeFocused();
  await expect(page.getByRole('button', { name: en['categories.moveSwapIn'] })).toBeVisible();

  const other = page.getByRole('combobox', {
    name: en['categories.moveOther'].replace('{{envelope}}', en['categories.readyToAssign']),
  });
  await reach(page, other);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Utilities');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  const outOfHousing = page.getByLabel(amountFor('Housing'));
  await reach(page, outOfHousing);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');

  await expect(availableOf(page, 'Housing')).toHaveText('$90');
  await expect(availableOf(page, 'Utilities')).toHaveText('$30');

  await reach(page, housing);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(amountFor('Housing'))).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel(amountFor('Housing'))).toHaveCount(0);
  await expectVisibleFocus(housing);

  await reach(
    page,
    page.getByRole('button', { name: en['categories.reorder'].replace('{{category}}', 'Housing') }),
  );

  const moneyFlow = page.locator('a[href="/accounts"]').filter({ visible: true });
  await reach(page, moneyFlow);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/accounts');

  const add = page.getByRole('button', { name: en['transactions.add'] });
  await reach(page, add);
  await page.keyboard.press('Enter');

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });
  await expect(form).toBeVisible();

  const amount = form.getByLabel(en['transactions.amountLabel'], { exact: true });
  await reach(page, amount);
  await page.keyboard.type('25');

  const category = form.getByRole('combobox', {
    name: en['transactions.categoryLabel'],
    exact: true,
  });
  await reach(page, category);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Groceries');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(category).toContainText('Groceries');

  const save = form.getByRole('button', { name: en['transactions.save'], exact: true });
  await reach(page, save);
  await page.keyboard.press('Enter');
  await expect(form).toBeHidden();

  await expect(page.getByTestId('accounts-total')).toContainText('975');

  const written = page
    .getByRole('listitem')
    .filter({ hasText: 'Groceries' })
    .locator('[data-slot="row-open"]');
  await reach(page, written);
});

test('a transaction is added from a category card and a default account is set, from the keyboard alone', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await recreateTestUser(KEYBOARD_ENTRY_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: KEYBOARD_ENTRY_TEST_EMAIL },
  });

  await onboard(page);

  const card = cardOf(page, 'Groceries');
  await reach(page, card);
  await page.keyboard.press('Enter');

  const add = page.getByRole('button', { name: en['categories.addTransaction'] });
  await reach(page, add);
  await page.keyboard.press('Enter');

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });
  await expect(form).toBeVisible();

  const amount = form.getByLabel(en['transactions.amountLabel'], { exact: true });
  await reach(page, amount);
  await page.keyboard.type('25');

  const save = form.getByRole('button', { name: en['transactions.save'], exact: true });
  await reach(page, save);
  await page.keyboard.press('Enter');
  await expect(form).toBeHidden();

  await expect(availableOf(page, 'Groceries')).toHaveText('-$25');
  await expect(card).toBeFocused();

  await page.keyboard.press('Enter');
  const manage = page.getByRole('button', { name: en['categories.manage'] });
  await reach(page, manage);
  await page.keyboard.press('Enter');

  const edit = page.getByRole('button', { name: en['categories.edit'], exact: true });
  await reach(page, edit);
  await page.keyboard.press('Enter');

  const field = page.getByRole('combobox', { name: en['categories.defaultAccountLabel'] });
  await reach(page, field);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(field).toContainText('Main card');

  const keep = page.getByRole('button', { name: en['categories.save'] });
  await reach(page, keep);
  await page.keyboard.press('Enter');
  await expect(field).toBeHidden();
});
