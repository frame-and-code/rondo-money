import { expect, test } from '@playwright/test';

import { API_URL } from '../playwright.config';

// Example e2e scenario (F0.8 DoD): the whole stack answers — the web app renders in a
// real browser, and the API it points at reports the F0.3 Postgres as up.
test('home page renders the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Fin Flow AI' })).toBeVisible();
  // The demo card advertises the API origin the client is wired to.
  await expect(page.getByText(API_URL)).toBeVisible();
});

test('the API behind the web app is healthy against Postgres', async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', info: { database: 'up' } });
});
