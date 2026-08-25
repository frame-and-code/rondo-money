import { clerkSetup } from '@clerk/testing/playwright';
import { loadEnvConfig } from '@next/env';

import { WEB_URL } from '../playwright.config';

import { ensureTestUser, hasClerkKeys, TEST_EMAILS } from './clerk';
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
