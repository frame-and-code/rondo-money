import { expect, test } from '@playwright/test';

import { hasClerkKeys } from './clerk';

test.skip(!process.env.CI && !hasClerkKeys(), 'Clerk keys are not configured');

test('the app icon is wired into the page, not merely sitting in the tree', async ({
  page,
  request,
}) => {
  await page.goto('/sign-in');

  // Next emits this link itself from `app/icon.svg`, and its href carries a hash. A file in
  // the wrong directory produces no link at all and no error anywhere, which is the failure
  // this asks about.
  const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
  if (href === null) {
    throw new Error('the page head carries no icon link');
  }

  const url = new URL(href, page.url()).toString();
  const icon = await request.get(url);

  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');

  // Served is not the same as usable: a malformed SVG answers 200 with the right type and
  // renders as a parser error page, which is a blank tab icon and no failure anywhere.
  await page.goto(url);
  await expect(page.locator('svg > rect')).toHaveCount(1);
});
