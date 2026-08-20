import { defineConfig, devices } from '@playwright/test';

// E2E level of the F0.8 harness: real browser against the real stack. Playwright boots
// both servers itself — the API (built, then `node dist/main.js`, talking to the F0.3
// Postgres; `docker compose up -d` first) and the web app (built, then `next start`).
//
// Web is a **production build** since F1.11, never `next dev`. Dev mode is a different
// application: no minification, different static optimisation and caching, different
// server-component behaviour. A green run against it proved nothing about what Railway
// serves. Locally an already-running server is still reused, but only a production one —
// e2e/global-setup.ts refuses a dev server on this port rather than quietly testing it. It
// reads the build's mode and not its age, so reuse is for a server this suite left running,
// never for one parked there across code changes.
//
// Deliberately not env-driven: 3001 is pinned by this package's start script, and the
// webServer below runs exactly `pnpm build && pnpm start` — an override here would only
// point the tests at a URL nothing listens on.
export const WEB_URL = 'http://localhost:3001';
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
      // Three steps, each of them load-bearing:
      //  · the check runs *before* the build, because `NEXT_PUBLIC_*` are inlined into the
      //    bundle — a missing one builds cleanly and only fails in a browser
      //    (check-public-env.mjs, the same rules the Dockerfile applies to the image);
      //  · the build is why the timeout below is minutes rather than one — a cold
      //    `next build` is far slower than `next dev`'s first page;
      //  · `next start` warns "does not work with output: standalone". It does work, and this
      //    suite is the evidence: standalone is an extra artefact, `.next` still holds the
      //    whole build. Serving the standalone bundle instead would be closer yet to what the
      //    image runs, and is separate work — it needs `.next/static` copied beside it and
      //    its own env plumbing, since it loads no `.env.local`.
      command: 'node ./check-public-env.mjs e2e && pnpm build && pnpm start',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      // The build log is worth seeing when it fails — Playwright discards a webServer's
      // stdout by default, which would leave a timeout with nothing to read.
      stdout: 'pipe',
      timeout: 300_000,
    },
  ],
});
