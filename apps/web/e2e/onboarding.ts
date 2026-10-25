import { expect, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import type { MessageKey } from '../src/i18n/messages';

type Words = Record<MessageKey, string>;

export const APP_ENTRY = '/categories';

export async function submitBudget(
  page: Page,
  name = 'Household',
  words: Words = en,
): Promise<void> {
  await page.getByRole('textbox', { name: words['newBudget.nameLabel'], exact: true }).fill(name);
  await page.getByRole('combobox', { name: words['newBudget.currencyLabel'] }).click();
  await page.getByPlaceholder(words['newBudget.searchPlaceholder']).fill('USD');
  await page.getByRole('option', { name: /USD/ }).click();
  await page.getByRole('button', { name: words['newBudget.submit'] }).click();
  await expect(page.getByRole('link', { name: words['newBudget.continue'] })).toBeVisible();
}

export async function submitAccount(
  page: Page,
  name = 'Main card',
  words: Words = en,
): Promise<void> {
  await page.getByRole('textbox', { name: words['newAccount.nameLabel'], exact: true }).fill(name);
  await page.getByLabel(words['newAccount.balanceLabel'], { exact: true }).fill('1000');
  await page.getByRole('button', { name: words['newAccount.submit'] }).click();
  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByTestId('ready-to-assign')).toBeVisible();
}

export async function onboard(page: Page, words: Words = en): Promise<void> {
  await page.goto(APP_ENTRY);

  const budgetStep = page.getByRole('heading', { name: words['newBudget.heading'] });
  const accountStep = page.getByRole('heading', { name: words['newAccount.heading'] });
  const app = page.getByTestId('ready-to-assign');

  await expect(budgetStep.or(accountStep).or(app)).toBeVisible();

  if (await budgetStep.isVisible()) {
    await submitBudget(page, 'Household', words);
    await page.getByRole('link', { name: words['newBudget.continue'] }).click();
    await expect(accountStep).toBeVisible();
  }

  if (await accountStep.isVisible()) {
    await submitAccount(page, 'Main card', words);
  }

  await expect(app).toBeVisible();
}
