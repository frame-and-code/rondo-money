import { createClerkClient } from '@clerk/backend';

export const TEST_EMAIL = 'e2e+clerk_test@example.com';

export const LOCALE_TEST_EMAIL = 'e2e-locale+clerk_test@example.com';

export const NAV_TEST_EMAIL = 'e2e-nav+clerk_test@example.com';

export const TEST_EMAILS = [TEST_EMAIL, LOCALE_TEST_EMAIL, NAV_TEST_EMAIL];

export const BUDGET_TEST_EMAIL = 'e2e-budget+clerk_test@example.com';

export const ONBOARDING_TEST_EMAIL = 'e2e-onboarding+clerk_test@example.com';

export const RESUME_TEST_EMAIL = 'e2e-resume+clerk_test@example.com';

export const FINISHED_TEST_EMAIL = 'e2e-finished+clerk_test@example.com';

export const MOVE_TEST_EMAIL = 'e2e-move+clerk_test@example.com';

export const MANAGE_TEST_EMAIL = 'e2e-manage+clerk_test@example.com';

export const TARGET_TEST_EMAIL = 'e2e-target+clerk_test@example.com';

export const ACCOUNTS_TEST_EMAIL = 'e2e-accounts+clerk_test@example.com';

export const ENTRIES_TEST_EMAIL = 'e2e-entries+clerk_test@example.com';

export const TRANSFER_TEST_EMAIL = 'e2e-transfer+clerk_test@example.com';

export const ARCHIVE_TEST_EMAIL = 'e2e-archive+clerk_test@example.com';

export const RECONCILE_TEST_EMAIL = 'e2e-reconcile+clerk_test@example.com';

export const SETTINGS_TEST_EMAIL = 'e2e-settings+clerk_test@example.com';

export const RESET_TEST_EMAIL = 'e2e-reset+clerk_test@example.com';

export const ERASE_TEST_EMAIL = 'e2e-erase+clerk_test@example.com';

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

export async function hasTestUser(email: string): Promise<boolean> {
  const { totalCount } = await client().users.getUserList({ emailAddress: [email] });

  return totalCount > 0;
}

export async function recreateTestUser(email: string): Promise<void> {
  const clerk = client();
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });

  await Promise.all(data.map((user) => clerk.users.deleteUser(user.id)));
  await create(clerk, email);
}

async function create(clerk: ReturnType<typeof createClerkClient>, email: string): Promise<void> {
  await clerk.users.createUser({ emailAddress: [email], skipPasswordRequirement: true });
}
