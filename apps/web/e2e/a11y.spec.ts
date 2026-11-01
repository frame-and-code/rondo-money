import AxeBuilder from '@axe-core/playwright';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { readyToAssign, turnTheDarkThemeOn } from './budget';
import { A11Y_TEST_EMAIL, hasClerkKeys, recreateTestUser } from './clerk';
import { submitAccount, submitBudget } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

async function scan(page: Page, screen: string): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  const { violations } = await new AxeBuilder({ page }).exclude('.cl-footer').analyze();
  const blocking = violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(' '),
        data: node.any[0]?.data,
      })),
    }));

  expect.soft(blocking, `critical or serious violations on ${screen}`).toEqual([]);
}

test('the main screens, a dialog and the dark theme carry no critical or serious accessibility violation', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto('/sign-in');
  await expect(page.locator('.cl-signIn-root, .cl-rootBox').first()).toBeVisible();
  await scan(page, 'sign-in');

  await recreateTestUser(A11Y_TEST_EMAIL);
  await setupClerkTestingToken({ page });
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: A11Y_TEST_EMAIL },
  });

  await page.goto('/categories');
  await expect(page.getByRole('heading', { name: en['newBudget.heading'] })).toBeVisible();
  await scan(page, 'new budget');
  await submitBudget(page);
  await page.getByRole('link', { name: en['newBudget.continue'] }).click();

  await expect(page.getByRole('heading', { name: en['newAccount.heading'] })).toBeVisible();
  await scan(page, 'first account');
  await submitAccount(page);

  await expect(readyToAssign(page)).toBeVisible();
  await scan(page, 'categories');

  await page.goto('/accounts');
  await expect(page.getByTestId('accounts-total')).toBeVisible();
  await scan(page, 'money flow');

  await page.getByRole('button', { name: en['transactions.add'] }).click();
  await expect(
    page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true }),
  ).toBeVisible();
  await scan(page, 'record form');
  await page.keyboard.press('Escape');

  await page.goto('/net-worth');
  await expect(page.getByRole('button', { name: en['netWorth.addAsset'] })).toBeVisible();
  await scan(page, 'net worth');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: en['settings.budgetNew'] })).toBeVisible();
  await scan(page, 'settings');

  await page.getByRole('button', { name: en['settings.budgetNew'] }).click();
  await page.getByRole('link', { name: en['settings.budgetNewFrom'] }).click();
  await expect(page).toHaveURL(/\/new\?from=/);
  await page
    .getByRole('textbox', { name: en['newBudget.nameLabel'], exact: true })
    .fill('Next year');
  await page.getByRole('button', { name: en['newBudget.submit'] }).click();
  await page.getByRole('link', { name: en['newBudget.balances'] }).click();
  await expect(page.getByLabel('Main card', { exact: true })).toBeVisible();
  await scan(page, 'opening balances');

  await page.goto('/categories');
  await expect(readyToAssign(page)).toBeVisible();
  await turnTheDarkThemeOn(page);
  await scan(page, 'categories, dark');
});
