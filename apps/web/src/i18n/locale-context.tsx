'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { detectBrowserLocale } from './detect-locale';
import { defaultLocale, type Locale } from './locales';
import { messages, type MessageKey } from './messages';

import type { ReactNode } from 'react';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  );
}

export function LocaleProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  // Browser detection only ever runs client-side, so the server (and the first client
  // render, to keep hydration consistent) always render `initialLocale` first and this
  // effect corrects it right after mount. Persisting the user's own choice — so this
  // doesn't run on every visit — is user settings, Phases 1/7.
  useEffect(() => {
    setLocale(detectBrowserLocale(navigator.languages ?? [navigator.language]));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => interpolate(messages[locale][key], vars),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslations(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useTranslations must be used within a LocaleProvider');
  }
  return ctx;
}
