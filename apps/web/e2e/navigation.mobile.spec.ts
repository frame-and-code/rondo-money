import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { assign, availableOf, cardOf, moveTo } from './budget';
import { hasClerkKeys, PHONE_NAV_TEST_EMAIL, PHONE_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard, submitAccount, submitBudget } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

async function signIn(page: Page, email: string): Promise<void> {
  await recreateTestUser(email);
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({ page, signInParams: { strategy: 'email_code', identifier: email } });
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scrolling = Array.from(document.querySelectorAll('*')).filter((element) =>
          ['auto', 'scroll'].includes(getComputedStyle(element).overflowX),
        );
        const wide = [document.documentElement, ...scrolling].filter(
          (element) => element.scrollWidth - element.clientWidth > 1,
        );

        return wide.map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
      }),
    )
    .toEqual([]);
}

async function expectOnScreen(page: Page, surface: Locator): Promise<void> {
  await expect(surface).toBeVisible();
  await expect
    .poll(async () => {
      const viewport = page.viewportSize();
      const box = await surface.boundingBox();
      if (!viewport || !box) return false;

      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height
      );
    })
    .toBe(true);
}

const surface = (page: Page) => page.getByRole('dialog').filter({ visible: true }).last();

test('on a phone the sections sit at the bottom of the screen and a tap moves between them', async ({
  page,
}) => {
  await signIn(page, PHONE_NAV_TEST_EMAIL);
  await onboard(page);

  const accounts = page.locator('a[href="/accounts"]').filter({ visible: true });
  await expect(accounts).toHaveCount(1);
  await expect(page.getByText('Rondo Money')).toBeHidden();

  const box = await accounts.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box?.y ?? 0).toBeGreaterThan((viewport?.height ?? 0) / 2);

  await accounts.click();
  await page.waitForURL('**/accounts');
  await expect(accounts).toHaveAttribute('aria-current', 'page');
});

test('every screen fits a phone, and money is assigned, moved and recorded through its drawers', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto('/sign-in');
  await expect(page.locator('.cl-signIn-root, .cl-rootBox').first()).toBeVisible();
  await expectNoSidewaysScroll(page);

  await signIn(page, PHONE_TEST_EMAIL);

  await page.goto('/categories');
  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await submitBudget(page);
  await page.getByRole('link', { name: en['newBudget.continue'] }).click();

  await expect(page.getByRole('heading', { name: en['newAccount.heading'] })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await submitAccount(page);

  await expectNoSidewaysScroll(page);
  await cardOf(page, 'Housing').click();
  await expectOnScreen(page, surface(page));
  await page.keyboard.press('Escape');

  await assign(page, '120', 'Housing');
  await moveTo(page, { from: 'Housing', to: 'Utilities', amount: '30' });
  await expect(availableOf(page, 'Housing')).toHaveText('$90');
  await expect(availableOf(page, 'Utilities')).toHaveText('$30');

  await page.goto('/accounts');
  await expect(page.getByTestId('accounts-total')).toContainText('1,000');
  await expectNoSidewaysScroll(page);

  await page.getByRole('button', { name: en['transactions.add'] }).click();
  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });
  await expectOnScreen(page, form);
  await form.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('25');
  await form.getByRole('combobox', { name: en['transactions.categoryLabel'], exact: true }).click();
  await page.getByRole('option', { name: 'Groceries', exact: true }).click();
  await form.getByRole('button', { name: en['transactions.save'], exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByTestId('accounts-total')).toContainText('975');

  await page.goto('/net-worth');
  await expect(page.getByRole('button', { name: en['netWorth.addAsset'] })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.getByRole('button', { name: en['netWorth.addAsset'] }).click();
  await expectOnScreen(page, surface(page));
  await page.keyboard.press('Escape');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: en['settings.budgetNew'] })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.getByRole('button', { name: en['settings.budgetNew'] }).click();
  await expectOnScreen(page, surface(page));
  await page.getByRole('link', { name: en['settings.budgetNewFrom'] }).click();

  await expect(page).toHaveURL(/\/new\?from=/);
  await expectNoSidewaysScroll(page);
  await page
    .getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true })
    .fill('Next year');
  await page.getByRole('button', { name: en['newBudget.submit'] }).click();
  await page.getByRole('link', { name: en['newBudget.balances'] }).click();

  await expect(page).toHaveURL(/\/new\/balances$/);
  await expect(page.getByLabel('Main card', { exact: true })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
