import { expect, type Locator, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

export const colourOf = (locator: Locator): Promise<string> =>
  locator.evaluate((node) => getComputedStyle(node).color);

export const tokenColour = (page: Page, token: string): Promise<string> =>
  page.evaluate((name) => {
    if (getComputedStyle(document.documentElement).getPropertyValue(name).trim() === '') {
      throw new Error(`The theme defines no ${name}, so its colour would read as the plain text.`);
    }

    const probe = document.createElement('span');

    probe.style.color = `var(${name})`;
    document.body.append(probe);

    const value = getComputedStyle(probe).color;

    probe.remove();

    return value;
  }, token);

export async function turnTheDarkThemeOn(page: Page): Promise<void> {
  await page.getByRole('button', { name: en['common.themeToggle.trigger'] }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
}

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

const surfaceOf = (page: Page) => page.getByTestId('move-dialog').or(page.getByRole('dialog'));

async function point(page: Page, turnLabel: string): Promise<void> {
  await expect(surfaceOf(page)).toBeVisible();

  const turn = page.getByRole('button', { name: turnLabel });

  if (await turn.isVisible()) {
    await turn.click();
  }
}

export async function assign(page: Page, amount: string, category: string): Promise<void> {
  await cardOf(page, category).click();
  await point(page, en['categories.moveSwapIn']);
  await amountField(page, category).fill(amount);
  await action(page).click();
  await expect(amountField(page, category)).toHaveCount(0);
}

export async function moveTo(
  page: Page,
  options: { from: string; to: string; amount: string },
): Promise<void> {
  await cardOf(page, options.from).click();
  await point(page, en['categories.moveSwapOut']);

  await page
    .getByRole('combobox', {
      name: en['categories.moveOther'].replace('{{envelope}}', en['categories.readyToAssign']),
    })
    .click();
  await page.getByRole('option', { name: options.to }).click();

  await amountField(page, options.from).fill(options.amount);
  await action(page).click();
  await expect(amountField(page, options.from)).toHaveCount(0);
}
