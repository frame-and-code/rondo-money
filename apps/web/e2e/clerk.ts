export const TEST_EMAIL = 'e2e+clerk_test@example.com';

export const LOCALE_TEST_EMAIL = 'e2e-locale+clerk_test@example.com';

/// Recreated on every run rather than reused. The budget scenario picks a language, so a
/// reused account would come back carrying the one the last run stored and the scenario would
/// start in the wrong one. A fresh Clerk user id also owns none of the budgets the last run
/// created.
export const BUDGET_TEST_EMAIL = 'e2e-budget+clerk_test@example.com';

export const TEST_EMAILS = [TEST_EMAIL, LOCALE_TEST_EMAIL];

export const RECREATED_TEST_EMAILS = [BUDGET_TEST_EMAIL];

export function hasClerkKeys(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
