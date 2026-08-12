'use client';

import { enUS } from '@clerk/localizations/en-US';
import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/themes';
import { useEffect, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import type { Locale } from '@/i18n/locales';
import { SIGN_IN_URL } from '@/lib/auth';

// Clerk's widgets (SignIn, UserButton) carry their own strings, translated via
// @clerk/localizations (F1.1 step 4). The active locale is client state
// (LocaleProvider, F0.7), so the provider lives in a client component: switching
// the app locale re-localizes Clerk on the fly.
// Dictionaries are heavy (~90 KB of source each), so only the English default ships in
// the initial bundle; the active locale's dictionary is lazy-loaded per locale via the
// package's `./<locale>` subpath exports.
const localizationLoaders: Record<Locale, () => Promise<typeof enUS>> = {
  en: () => import('@clerk/localizations/en-US').then((m) => m.enUS),
  pl: () => import('@clerk/localizations/pl-PL').then((m) => m.plPL),
  ru: () => import('@clerk/localizations/ru-RU').then((m) => m.ruRU),
};

export function ClerkProviderLocalized({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslations();
  const [localization, setLocalization] = useState(enUS);

  useEffect(() => {
    let stale = false;
    void localizationLoaders[locale]()
      .then((dictionary) => {
        if (!stale) setLocalization(dictionary);
      })
      // A dictionary chunk can fail to load (offline, or a stale tab requesting a chunk
      // a redeploy has removed). Localization is cosmetic — keep the English default
      // rather than crashing the tree with an unhandled rejection.
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [locale]);

  return (
    <ClerkProvider
      appearance={{ theme: shadcn }}
      localization={localization}
      signInUrl={SIGN_IN_URL}
    >
      {children}
    </ClerkProvider>
  );
}
