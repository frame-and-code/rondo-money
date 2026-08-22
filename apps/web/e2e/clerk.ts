export const TEST_EMAIL = 'e2e+clerk_test@example.com';

export const LOCALE_TEST_EMAIL = 'e2e-locale+clerk_test@example.com';

export const TEST_EMAILS = [TEST_EMAIL, LOCALE_TEST_EMAIL];

export function hasClerkKeys(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
