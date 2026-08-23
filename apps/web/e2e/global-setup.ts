import { createClerkClient } from '@clerk/backend';
import { clerkSetup } from '@clerk/testing/playwright';
import { loadEnvConfig } from '@next/env';

import { WEB_URL } from '../playwright.config';

import { hasClerkKeys, RECREATED_TEST_EMAILS, TEST_EMAILS } from './clerk';
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
  await Promise.all([
    ...TEST_EMAILS.map((email) => ensureTestUser(email)),
    ...RECREATED_TEST_EMAILS.map((email) => recreateTestUser(email)),
  ]);
}

async function ensureTestUser(email: string) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { totalCount } = await clerk.users.getUserList({ emailAddress: [email] });
  if (totalCount > 0) return;

  await createTestUser(clerk, email);
}

/// A new Clerk user id every run, so the account owns nothing from the last one. The rows the
/// previous run wrote stay in the database under an id nobody signs in as any more, which is
/// the price of keeping Prisma out of apps/web (ADR-002).
async function recreateTestUser(email: string) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });

  await Promise.all(data.map((user) => clerk.users.deleteUser(user.id)));
  await createTestUser(clerk, email);
}

async function createTestUser(clerk: ReturnType<typeof createClerkClient>, email: string) {
  await clerk.users.createUser({
    emailAddress: [email],
    skipPasswordRequirement: true,
  });
}
