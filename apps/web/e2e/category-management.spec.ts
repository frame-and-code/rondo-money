import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';

import { en } from '../src/i18n/messages/en';

import { assign, availableOf, cardOf } from './budget';
import { hasClerkKeys, MANAGE_TEST_EMAIL, recreateTestUser } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const NEW_CATEGORY = 'Weekend';

test('a category is created, emptied, hidden, and another is dragged into a new place', async ({
  page,
}) => {
  await recreateTestUser(MANAGE_TEST_EMAIL);
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: MANAGE_TEST_EMAIL },
  });

  await onboard(page);
  await expect(availableOf(page, 'Groceries')).toBeVisible();

  await page
    .getByRole('button', { name: en['categories.addTo'].replace('{{group}}', 'Bills') })
    .click();
  await page.getByLabel(en['categories.nameLabel'], { exact: true }).fill(NEW_CATEGORY);
  await page.getByRole('button', { name: en['categories.lookPick'] }).click();
  await page.getByTestId('icon-beach').click();
  await page.getByTestId('color-teal').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: en['categories.save'] }).click();

  await expect(availableOf(page, NEW_CATEGORY)).toBeVisible();

  await assign(page, '30', NEW_CATEGORY);
  await expect(availableOf(page, NEW_CATEGORY)).toHaveText('$30.00');

  await cardOf(page, NEW_CATEGORY).click();
  await page.getByRole('button', { name: en['categories.manage'] }).click();
  await page.getByRole('button', { name: en['categories.hide'], exact: true }).click();

  await expect(page.getByTestId('hide-total')).toHaveText('$30.00');
  await expect(
    page.getByRole('button', { name: en['categories.hide'], exact: true }),
  ).toBeDisabled();

  await page.getByRole('button', { name: en['categories.release'] }).click();

  await expect(page.getByTestId('hide-total')).toHaveText('$0.00');
  await expect(page.getByRole('button', { name: en['categories.release'] })).toHaveCount(0);

  await page.getByRole('button', { name: en['categories.hide'], exact: true }).click();

  await expect(cardOf(page, NEW_CATEGORY)).toHaveCount(0);
  await expect(availableOf(page, 'Groceries')).toBeVisible();

  await expect(page.getByTestId('category-name').filter({ hasText: NEW_CATEGORY })).toHaveCount(0);

  await expect(page.locator('[data-base-ui-inert]')).toHaveCount(0);

  const before = await page.getByTestId('category-name').allTextContents();

  const grip = page.getByTestId('reorder-Groceries');
  await grip.scrollIntoViewIfNeeded();
  await grip.hover();

  const from = await grip.boundingBox();
  const onto = await cardOf(page, 'Transport').boundingBox();
  if (!from || !onto) {
    throw new Error('The two cards the drag needs are not on the screen');
  }

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (const step of [0.15, 0.4, 0.7, 1]) {
    await page.mouse.move(
      from.x + from.width / 2 + (onto.x + onto.width / 2 - from.x - from.width / 2) * step,
      from.y + from.height / 2 + (onto.y + onto.height / 2 - from.y - from.height / 2) * step,
      { steps: 6 },
    );
    await page.waitForTimeout(120);
  }

  await page.mouse.move(onto.x + onto.width / 2 + 4, onto.y + onto.height / 2 + 4, { steps: 3 });
  await page.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, { steps: 3 });
  await page.waitForTimeout(200);
  await page.mouse.up();

  await expect.poll(() => page.getByTestId('category-name').allTextContents()).not.toEqual(before);

  await page.reload();
  await expect(availableOf(page, 'Groceries')).toBeVisible();

  const after = await page.getByTestId('category-name').allTextContents();

  expect(after).not.toEqual(before);
  expect([...after].sort()).toEqual([...before].sort());
});
