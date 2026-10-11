import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { hasClerkKeys, NET_WORTH_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const OWNED = 'Garage';
const OWED = 'Car loan';

test('net worth follows what is written down as owned and owed, below zero included', async ({
  page,
}) => {
  await recreateTestUser(NET_WORTH_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: NET_WORTH_TEST_EMAIL },
  });

  await onboard(page);
  await page.goto('/net-worth');

  const total = page.getByTestId('net-worth-total');
  const name = page.getByLabel(en['netWorth.nameLabel'], { exact: true });
  const amount = page.getByLabel(en['netWorth.amountLabel'], { exact: true });
  const save = page.getByRole('button', { name: en['netWorth.save'] });

  await expect(total).toContainText('1,000');
  await expect(page.getByTestId('net-worth-block-accounts').getByText('Main card')).toBeVisible();

  await page.getByRole('button', { name: en['netWorth.addAsset'] }).click();
  await name.fill(OWNED);
  await amount.fill('250');
  await save.click();

  await expect(page.getByTestId('net-worth-block-assets').getByText(OWNED)).toBeVisible();
  await expect(total).toContainText('1,250');

  await page
    .getByRole('button', { name: en['netWorth.actionsForAsset'].replace('{{name}}', OWNED) })
    .click();
  await page.getByRole('menuitem', { name: en['netWorth.edit'] }).click();
  await amount.fill('300');
  await save.click();

  await expect(total).toContainText('1,300');

  await page.getByRole('button', { name: en['netWorth.addLiability'] }).click();
  await name.fill(OWED);
  await amount.fill('2000');
  await save.click();

  await expect(page.getByTestId('net-worth-block-liabilities').getByText(OWED)).toBeVisible();
  await expect(total).toContainText('700');
  await expect(total).toHaveText(/[−-]/);

  await page
    .getByRole('button', { name: en['netWorth.actionsForLiability'].replace('{{name}}', OWED) })
    .click();
  await page.getByRole('menuitem', { name: en['netWorth.delete'] }).click();
  await page.getByRole('button', { name: en['netWorth.delete'] }).click();

  await expect(page.getByTestId('net-worth-block-liabilities').getByText(OWED)).toHaveCount(0);
  await expect(total).toContainText('1,300');
});
