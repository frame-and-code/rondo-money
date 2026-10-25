'use client';

import { enUS } from '@clerk/localizations/en-US';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { shadcn } from '@clerk/themes';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { Locale } from '@/i18n/locales';
import { SIGN_IN_URL } from '@/lib/auth';

const localizationLoaders: Record<Locale, () => Promise<typeof enUS>> = {
  en: () => import('@clerk/localizations/en-US').then((m) => m.enUS),
  pl: () => import('@clerk/localizations/pl-PL').then((m) => m.plPL),
  ru: () => import('@clerk/localizations/ru-RU').then((m) => m.ruRU),
};

function ReportLoaded({ onLoaded }: { onLoaded: () => void }) {
  const { isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded) onLoaded();
  }, [isLoaded, onLoaded]);

  return null;
}

export function ClerkProviderLocalized({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslations();
  const [localization, setLocalization] = useState(enUS);
  const [loaded, setLoaded] = useState(false);
  const markLoaded = useCallback(() => setLoaded(true), []);
  const handed = useMemo(
    () => (loaded ? { ...localization } : localization),
    [localization, loaded],
  );

  useEffect(() => {
    let stale = false;
    void localizationLoaders[locale]().then((dictionary) => {
      if (!stale) setLocalization(dictionary);
    });
    return () => {
      stale = true;
    };
  }, [locale]);

  return (
    <ClerkProvider appearance={{ theme: shadcn }} localization={handed} signInUrl={SIGN_IN_URL}>
      <ReportLoaded onLoaded={markLoaded} />
      {children}
    </ClerkProvider>
  );
}
