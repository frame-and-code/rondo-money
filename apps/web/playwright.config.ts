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
    // Pinned rather than left to the runner's own locale. onboarding.spec.ts asserts that a
    // new user's first screen comes up in English, and e2e/onboarding.ts fills every field by
    // its English label, so both would depend on the runner's machine silently. A test that
    // wants a different locale opens its own context, the way locale.spec.ts already does.
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
