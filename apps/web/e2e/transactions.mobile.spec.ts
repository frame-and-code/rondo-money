import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { availableOf, cardOf } from './budget';
import { hasClerkKeys, PHONE_ENTRY_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard } from './onboarding';
import { expectNoSidewaysScroll, expectOnScreen } from './phone';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const CATEGORY = 'Groceries';

test('on a phone an expense is added from a category card in one sheet, and the card shows it', async ({
  page,
}) => {
  await recreateTestUser(PHONE_ENTRY_TEST_EMAIL);
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: PHONE_ENTRY_TEST_EMAIL },
  });

  await onboard(page);

  await cardOf(page, CATEGORY).click();
  await page.getByRole('button', { name: en['categories.addTransaction'] }).click();

  const form = page.getByRole('dialog', { name: en['transactions.createTitle'], exact: true });
  await expect(form).toBeVisible();
  await expect(page.getByRole('dialog').filter({ visible: true })).toHaveCount(1);
  await expectOnScreen(page, form);
  await expectNoSidewaysScroll(page);

  await expect(form.getByRole('combobox', { name: en['transactions.categoryLabel'] })).toHaveText(
    CATEGORY,
  );

  await form.getByLabel(en['transactions.amountLabel'], { exact: true }).fill('25');
  await form.getByRole('button', { name: en['transactions.save'], exact: true }).click();

  await expect(form).toBeHidden();
  await expect(availableOf(page, CATEGORY)).toHaveText('-$25');
});
