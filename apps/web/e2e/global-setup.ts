import { createClerkClient } from '@clerk/backend';
import { clerkSetup } from '@clerk/testing/playwright';
import { loadEnvConfig } from '@next/env';

import { hasClerkKeys, TEST_EMAIL } from './clerk';

// Obtains a Clerk Testing Token for the dev instance (reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// and CLERK_SECRET_KEY) so automated browsers bypass Clerk's bot detection — the official
// prerequisite for driving sign-in flows from Playwright.
export default async function globalSetup() {
  // Playwright doesn't read .env files on its own — load them the same way Next does
  // (.env.local first), so local runs need no manual exports. In CI the variables come
  // from the workflow env and .env files don't exist.
  loadEnvConfig(process.cwd());

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
  await ensureTestUser();
}

// clerk.signIn() signs an existing user in — it never registers one, so a fresh dev
// instance (or a CI instance that was reset) has no account to sign in with. Create it
// through the Backend API, idempotently: every run reuses the same account.
async function ensureTestUser() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { totalCount } = await clerk.users.getUserList({ emailAddress: [TEST_EMAIL] });
  if (totalCount > 0) return;

  await clerk.users.createUser({
    emailAddress: [TEST_EMAIL],
    skipPasswordRequirement: true,
  });
}
