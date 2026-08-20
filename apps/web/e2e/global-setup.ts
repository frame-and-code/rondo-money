import { createClerkClient } from '@clerk/backend';
import { clerkSetup } from '@clerk/testing/playwright';
import { loadEnvConfig } from '@next/env';

import { WEB_URL } from '../playwright.config';
import { HEALTH_URL } from '../src/lib/auth';

import { hasClerkKeys, TEST_EMAILS } from './clerk';

// Obtains a Clerk Testing Token for the dev instance (reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// and CLERK_SECRET_KEY) so automated browsers bypass Clerk's bot detection — the official
// prerequisite for driving sign-in flows from Playwright.
export default async function globalSetup() {
  // Playwright doesn't read .env files on its own — load them the same way Next does
  // (.env.local first), so local runs need no manual exports. In CI the variables come
  // from the workflow env and .env files don't exist.
  loadEnvConfig(process.cwd());

  await assertProductionWebServer();

  if (!hasClerkKeys()) {
    // In CI the keys are guaranteed (the workflow skips this whole step without them),
    // so a missing key there is a broken secret — fail instead of quietly skipping half
    // the suite. Locally, a run without keys still exercises the non-auth scenarios.
    if (process.env.CI) {
      throw new Error(
        'Clerk keys are missing in CI: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY ' +
          'must be set (GitHub → Settings → Secrets → Actions).',
      );
    }
    console.warn('Clerk keys are not configured — auth e2e scenarios will be skipped.');
    return;
  }

  await clerkSetup();
  await Promise.all(TEST_EMAILS.map((email) => ensureTestUser(email)));
}

// F1.11: the suite is only evidence about production if a production build served it.
// Playwright builds and starts one itself, but locally it reuses whatever already answers on
// the port — and a `pnpm dev` server left in another terminal answers identically while being
// a different application (no minification, different static optimisation and caching,
// different server-component behaviour). Web servers are started before globalSetup runs, so
// this is the first moment the suite can ask which one it got; refusing here costs a second,
// while a green run against dev costs the whole point of the level.
//
// What it cannot see is **age**. `mode` comes from the bundle, so a production server built an
// hour ago from different sources answers exactly like one built just now, and reuse would test
// it. That is the deliberate edge of `reuseExistingServer`: it is for a server this suite left
// running, not for one kept warm across code changes (docs/testing.md says so too).
async function assertProductionWebServer() {
  const url = `${WEB_URL}${HEALTH_URL}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} — expected the web app's liveness probe.`);
  }

  const { mode } = (await response.json()) as { mode?: string };
  if (mode !== 'production') {
    throw new Error(
      `${url} reports mode "${mode}", not "production": e2e are running against a development ` +
        'server, which proves nothing about the build that ships. Stop whatever is on that port ' +
        'and let Playwright build, or serve a production build yourself: ' +
        '`pnpm --filter @rondo/web build && pnpm --filter @rondo/web start`.',
    );
  }
}

// clerk.signIn() signs an existing user in — it never registers one, so a fresh dev
// instance (or a CI instance that was reset) has no account to sign in with. Create it
// through the Backend API, idempotently: every run reuses the same accounts.
async function ensureTestUser(email: string) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { totalCount } = await clerk.users.getUserList({ emailAddress: [email] });
  if (totalCount > 0) return;

  await clerk.users.createUser({
    emailAddress: [email],
    skipPasswordRequirement: true,
  });
}
