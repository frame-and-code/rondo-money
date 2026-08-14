import { defineConfig, devices } from '@playwright/test';

// E2E level of the F0.8 harness: real browser against the real stack. Playwright boots
// both servers itself — the API (built, then `node dist/main.js`, talking to the F0.3
// Postgres; `docker compose up -d` first) and the web app (`next dev`). Locally it
// reuses servers you already have running, so `pnpm dev` + `pnpm test:e2e` is fast.
// Deliberately not env-driven: 3001 is pinned by this package's dev/start scripts,
// and the webServer below starts exactly `pnpm dev` — an override here would only
// point the tests at a URL nothing listens on.
const WEB_URL = 'http://localhost:3001';
// Mirrors the app's own env contract (src/lib/api/config.ts): the tests must hit
// whatever API the web app is wired to.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // Clerk Testing Token for the whole run (auth.spec.ts drives real sign-in flows).
  globalSetup: './e2e/global-setup.ts',
  // E2E state lives outside the process (servers, DB) — never let a worker's failure
  // artifacts interleave; keep the example harness single-worker until suites grow.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Build the API and its workspace deps (@rondo/db needs its tsc emit), then run
      // the compiled server — steadier under test than `nest start --watch`.
      command: 'pnpm --filter @rondo/api... build && pnpm --filter @rondo/api start',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
