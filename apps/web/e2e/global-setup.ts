import { createClerkClient } from '@clerk/backend';
import { clerkSetup } from '@clerk/testing/playwright';
import { loadEnvConfig } from '@next/env';

import { WEB_URL } from '../playwright.config';

import { hasClerkKeys, TEST_EMAILS } from './clerk';
import { assertProductionWebServer } from './production-server';

export default async function globalSetup() {
  loadEnvConfig(process.cwd());

  await assertProductionWebServer(WEB_URL);

  if (!hasClerkKeys()) {
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

async function ensureTestUser(email: string) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { totalCount } = await clerk.users.getUserList({ emailAddress: [email] });
  if (totalCount > 0) return;

  await clerk.users.createUser({
    emailAddress: [email],
    skipPasswordRequirement: true,
  });
}
