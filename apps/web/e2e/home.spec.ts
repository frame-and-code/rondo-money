import { expect, test } from '@playwright/test';

import { API_URL } from '../playwright.config';

test('the API behind the web app is healthy against Postgres', async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', info: { database: 'up' } });
});
