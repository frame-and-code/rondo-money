import { expect, test } from '@playwright/test';

import { hasClerkKeys } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test('the app icon is wired into the page, not merely sitting in the tree', async ({
  page,
  request,
}) => {
  await page.goto('/sign-in');

  const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
  if (href === null) {
    throw new Error('the page head carries no icon link');
  }

  const url = new URL(href, page.url()).toString();
  const icon = await request.get(url);

  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');

  await page.goto(url);
  await expect(page.locator('svg > rect')).toHaveCount(1);
});
