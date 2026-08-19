// The dev instance supports test accounts out of the box: any email like
// `<name>+clerk_test@example.com` signs in with the fixed OTP 424242 and no real mail is
// sent. Shared by global-setup (which creates the accounts) and the specs.
export const TEST_EMAIL = 'e2e+clerk_test@example.com';

// A second account, used only by locale.spec.ts. Separate because `GET /user-settings` is
// get-or-create: the first scenario to sign in as a given user fixes that user's language for
// every later run, so sharing one account would make the locale assertion depend on which
// spec happened to run first — green today, red after an unrelated reorder.
export const LOCALE_TEST_EMAIL = 'e2e-locale+clerk_test@example.com';

/** Every account the suite signs in as, so global-setup creates them all. */
export const TEST_EMAILS = [TEST_EMAIL, LOCALE_TEST_EMAIL];

// Both keys are required to exercise any auth scenario. In CI their absence is a
// misconfiguration, not a valid mode: the workflow only reaches the e2e step when the
// secrets are set (fork PRs skip it entirely), so the suite fails loudly there and only
// skips locally — a green run must never mean "auth was never tested".
export function hasClerkKeys(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
