import { createClerkClient } from '@clerk/backend';

export const TEST_EMAIL = 'e2e+clerk_test@example.com';

export const LOCALE_TEST_EMAIL = 'e2e-locale+clerk_test@example.com';

export const NAV_TEST_EMAIL = 'e2e-nav+clerk_test@example.com';

/// The shared accounts, created once and kept. `TEST_EMAIL` and `LOCALE_TEST_EMAIL` never
/// write, so they stay users who have no budget, which is what their scenarios are about.
/// The navigation one is taken through setup by the helper, which is idempotent, so it does
/// not need a fresh id.
export const TEST_EMAILS = [TEST_EMAIL, LOCALE_TEST_EMAIL, NAV_TEST_EMAIL];

/// One address per onboarding scenario, recreated by the scenario itself rather than once per
/// run. A scenario about a user who has no budget cannot survive its own retry otherwise: the
/// first attempt leaves a budget behind, and `retries` would then always find one.
export const ONBOARDING_TEST_EMAIL = 'e2e-onboarding+clerk_test@example.com';

export const RESUME_TEST_EMAIL = 'e2e-resume+clerk_test@example.com';

export const FINISHED_TEST_EMAIL = 'e2e-finished+clerk_test@example.com';

export function hasClerkKeys(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

function client() {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}

export async function ensureTestUser(email: string): Promise<void> {
  const clerk = client();
  const { totalCount } = await clerk.users.getUserList({ emailAddress: [email] });
  if (totalCount > 0) return;

  await create(clerk, email);
}

/// A new Clerk user id, so the account owns nothing an earlier attempt wrote. The rows that
/// attempt left stay in the database under an id nobody signs in as any more, which is the
/// price of keeping Prisma out of apps/web (ADR-002).
export async function recreateTestUser(email: string): Promise<void> {
  const clerk = client();
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });

  await Promise.all(data.map((user) => clerk.users.deleteUser(user.id)));
  await create(clerk, email);
}

async function create(clerk: ReturnType<typeof createClerkClient>, email: string): Promise<void> {
  await clerk.users.createUser({ emailAddress: [email], skipPasswordRequirement: true });
}
