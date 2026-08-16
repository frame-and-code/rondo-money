'use client';

import { SignIn } from '@clerk/nextjs';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { useTranslations } from '@/i18n/locale-context';

// Public sign-in route (F1.1 step 6): Clerk requires the catch-all segment. The path
// itself lives in SIGN_IN_URL (src/lib/auth.ts) — proxy.ts derives both the public-route
// matcher and Clerk's redirect target from it. There is no /sign-up page on purpose —
// users sign in with Google/email and OAuth auto-creates the account. The locale
// switcher drives Clerk's own strings too: ClerkProviderLocalized re-localizes the
// widget when the app locale changes.
export default function SignInPage() {
  const { t } = useTranslations();

  return (
    <main className="relative flex min-h-svh items-center justify-center p-8">
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <LocaleSwitcher />
        <ThemeToggle
          labels={{
            trigger: t('common.themeToggle.trigger'),
            light: t('common.themeToggle.light'),
            dark: t('common.themeToggle.dark'),
            system: t('common.themeToggle.system'),
          }}
        />
      </div>
      <SignIn />
    </main>
  );
}
