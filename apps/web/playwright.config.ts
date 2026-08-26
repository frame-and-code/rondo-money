import { defineConfig, devices } from '@playwright/test';

export const WEB_URL = 'http://localhost:3001';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @rondo/api... build && pnpm --filter @rondo/api start',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node ./check-public-env.mjs e2e && pnpm build && pnpm start',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      timeout: 300_000,
    },
  ],
});
