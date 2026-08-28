import { expect, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

export const cardOf = (page: Page, category: string) =>
  page.getByRole('button', {
    name: en['categories.moveOpen'].replace('{{category}}', category),
  });

export const assignedOf = (page: Page, category: string) =>
  page.getByTestId(`assigned-${category}`);

export const availableOf = (page: Page, category: string) =>
  page.getByTestId(`available-${category}`);

export const readyToAssign = (page: Page) => page.getByTestId('ready-to-assign');

export const freeMoney = async (page: Page): Promise<string> =>
  (await readyToAssign(page).innerText()).replace(/\s+/gu, ' ').trim();

const amountField = (page: Page, envelope: string) =>
  page.getByLabel(en['categories.moveAmountFor'].replace('{{envelope}}', envelope));

const action = (page: Page) =>
  page.getByRole('button', {
    name: new RegExp(`^(${en['categories.moveSubmit']}|${en['categories.moveAssign']})$`),
  });

async function pointInto(page: Page): Promise<void> {
  await expect(page.getByTestId('move-dialog').or(page.getByRole('dialog'))).toBeVisible();

  const turn = page.getByRole('button', { name: en['categories.moveSwapIn'] });

  if (await turn.isVisible()) {
    await turn.click();
  }
}

export async function assign(page: Page, amount: string, category: string): Promise<void> {
  await cardOf(page, category).click();
  await pointInto(page);
  await amountField(page, category).fill(amount);
  await action(page).click();
  await expect(amountField(page, category)).toHaveCount(0);
}

export async function moveTo(
  page: Page,
  options: { from: string; to: string; amount: string },
): Promise<void> {
  await cardOf(page, options.from).click();

  await expect(page.getByTestId('move-dialog').or(page.getByRole('dialog'))).toBeVisible();

  const turn = page.getByRole('button', { name: en['categories.moveSwapOut'] });
  if (await turn.isVisible()) {
    await turn.click();
  }

  await page
    .getByRole('combobox', {
      name: en['categories.moveOther'].replace('{{envelope}}', en['categories.readyToAssign']),
    })
    .click();
  await page.getByRole('option', { name: new RegExp(options.to) }).click();

  await amountField(page, options.from).fill(options.amount);
  await action(page).click();
  await expect(amountField(page, options.from)).toHaveCount(0);
}
