'use client';

import { SignIn } from '@clerk/nextjs';
import { ThemeToggle } from '@rondo/ui/components/theme-toggle';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { useTranslations } from '@/i18n/locale-context';

export default function SignInPage() {
  const { t } = useTranslations();

  return (
    <main className="relative flex min-h-svh items-center justify-center p-8">
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <LocaleSwitcher />
        <ThemeToggle label={t('common.themeToggle.trigger')} />
      </div>
      <SignIn />
    </main>
  );
}
