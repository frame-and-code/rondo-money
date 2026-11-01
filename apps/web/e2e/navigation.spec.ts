import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';

import { hasClerkKeys, NAV_TEST_EMAIL } from './clerk';
import { onboard } from './onboarding';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

const SECTIONS = ['/categories', '/accounts', '/net-worth', '/settings'];

async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: NAV_TEST_EMAIL },
  });
  await onboard(page);
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
