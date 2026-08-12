import { expect, test } from '@playwright/test';

import { API_URL } from '../playwright.config';

// Example e2e scenario (F0.8 DoD): the whole stack answers — the API the web app points
// at reports the F0.3 Postgres as up. The app-shell rendering itself is covered by
// auth.spec.ts (F1.1): the home page now requires a signed-in session.
test('the API behind the web app is healthy against Postgres', async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', info: { database: 'up' } });
});
