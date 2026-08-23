import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { hasClerkKeys, TEST_EMAIL } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const SECTIONS = ['/categories', '/accounts', '/net-worth', '/settings'];

const PHONE = { width: 390, height: 844 };

async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });
}

test('the menu carries a signed-in user through every section', async ({ page }) => {
  await signIn(page);
  await page.goto('/categories');

  for (const href of SECTIONS) {
    const link = page.locator(`a[href="${href}"]`).filter({ visible: true });
    const label = ((await link.textContent()) ?? '').trim();

    expect(label).not.toBe('');

    await link.click();
    await page.waitForURL(`**${href}`);

    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[aria-current="page"]').filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
  }
});

test('on a phone the sections sit at the bottom of the screen and a tap moves between them', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize(PHONE);
  await page.goto('/categories');

  const accounts = page.locator('a[href="/accounts"]').filter({ visible: true });
  await expect(accounts).toHaveCount(1);
  await expect(page.getByText('Rondo Money')).toBeHidden();

  const box = await accounts.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.y ?? 0).toBeGreaterThan(PHONE.height / 2);

  await accounts.click();
  await page.waitForURL('**/accounts');
  await expect(accounts).toHaveAttribute('aria-current', 'page');
});
