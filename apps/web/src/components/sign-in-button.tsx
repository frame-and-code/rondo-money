'use client';

import { SignInButton } from '@clerk/nextjs';
import { Button } from '@ffai/ui/components/ui/button';

import { useTranslations } from '@/i18n/locale-context';

export function SignInButtonLocalized() {
  const { t } = useTranslations();

  return (
    <SignInButton>
      <Button className="mx-auto w-1/3">{t('auth.signIn')}</Button>
    </SignInButton>
  );
}
