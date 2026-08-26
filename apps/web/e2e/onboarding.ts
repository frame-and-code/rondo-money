import { expect, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

export const APP_ENTRY = '/categories';

export async function submitBudget(page: Page, name = 'Household'): Promise<void> {
  await page.getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true }).fill(name);
  await page.getByRole('combobox', { name: en['newBudget.currencyLabel'] }).click();
  await page.getByPlaceholder(en['newBudget.searchPlaceholder']).fill('USD');
  await page.getByRole('option', { name: /USD/ }).click();
  await page.getByRole('button', { name: en['newBudget.submit'] }).click();
  await expect(page.getByRole('link', { name: en['newBudget.continue'] })).toBeVisible();
}

export async function submitAccount(page: Page, name = 'Main card'): Promise<void> {
  await page.getByRole('textbox', { name: en['newAccount.nameLabel'], exact: true }).fill(name);
  await page.getByLabel(en['newAccount.balanceLabel'], { exact: true }).fill('1000');
  await page.getByRole('button', { name: en['newAccount.submit'] }).click();
  await expect(page.getByText(en['newAccount.startAssigning'])).toBeVisible();
}

export async function onboard(page: Page): Promise<void> {
  await page.goto(APP_ENTRY);

  const budgetStep = page.getByRole('heading', { name: en['newBudget.heading'] });
  const accountStep = page.getByRole('heading', { name: en['newAccount.heading'] });
  const app = page.getByText(en['categories.slotTitle']);

  await expect(budgetStep.or(accountStep).or(app)).toBeVisible();

  if (await budgetStep.isVisible()) {
    await submitBudget(page);
    await page.getByRole('link', { name: en['newBudget.continue'] }).click();
    await expect(accountStep).toBeVisible();
  }

  if (await accountStep.isVisible()) {
    await submitAccount(page);
    await page.getByRole('link', { name: en['nav.categories'] }).click();
  }

  await expect(app).toBeVisible();
}
