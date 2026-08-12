// The dev instance supports test accounts out of the box: any email like
// `<name>+clerk_test@example.com` signs in with the fixed OTP 424242 and no real mail is
// sent. Shared by global-setup (which creates the account) and the auth spec.
export const TEST_EMAIL = 'e2e+clerk_test@example.com';

// Both keys are required to exercise any auth scenario. In CI their absence is a
// misconfiguration, not a valid mode: the workflow only reaches the e2e step when the
// secrets are set (fork PRs skip it entirely), so the suite fails loudly there and only
// skips locally — a green run must never mean "auth was never tested".
export function hasClerkKeys(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
