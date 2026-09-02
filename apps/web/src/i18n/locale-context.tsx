'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { detectBrowserLocale } from './detect-locale';
import { defaultLocale, isLocale, type Locale } from './locales';
import { messages, type MessageKey } from './messages';

import type { ReactNode } from 'react';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  applySettingsLocale: (userId: string | null | undefined, language: Locale | null) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = 'rondo.locale';

function storageKey(userId: string | null): string {
  return userId === null ? STORAGE_KEY : `${STORAGE_KEY}:${userId}`;
}

function readStoredLocale(userId: string | null): Locale | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }

  return stored !== null && isLocale(stored) ? stored : null;
}

function storeLocaleIfPossible(userId: string | null, locale: Locale): void {
  try {
    window.localStorage.setItem(storageKey(userId), locale);
  } catch {} // eslint-disable-line no-empty -- best effort; storage may be unavailable
}

interface SettingsBinding {
  identity: string | null | undefined;
  language: Locale | null;
}

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
  const [settings, setSettings] = useState<SettingsBinding>({
    identity: undefined,
    language: null,
  });
  const [picked, setPicked] = useState<Locale | null>(null);
  const [remembered, setRemembered] = useState<Locale | null>(null);
  const [fromBrowser, setFromBrowser] = useState<Locale | null>(null);

  const unfiledPick = useRef<Locale | null>(null);

  const { identity } = settings;
  const fromSettings = settings.language;

  const locale = picked ?? fromSettings ?? remembered ?? fromBrowser ?? initialLocale;

  const setLocale = useCallback(
    (next: Locale) => {
      setPicked(next);

      if (typeof identity === 'string') return;

      if (identity === undefined) {
        unfiledPick.current = next;
      }

      storeLocaleIfPossible(null, next);
    },
    [identity],
  );

  const applySettingsLocale = useCallback(
    (identity: string | null | undefined, next: Locale | null) => {
      setSettings((current) =>
        current.identity === identity && current.language === next
          ? current
          : { identity, language: next },
      );
    },
    [],
  );

  useLayoutEffect(() => {
    if (identity === undefined) {
      setRemembered(readStoredLocale(null));
      return;
    }

    if (identity === null) {
      setPicked(null);
      setRemembered(readStoredLocale(null));
      return;
    }

    const unfiled = unfiledPick.current;
    unfiledPick.current = null;

    setPicked(null);
    setRemembered(unfiled ?? readStoredLocale(identity));
  }, [identity]);

  useEffect(() => {
    setFromBrowser(detectBrowserLocale(navigator.languages ?? [navigator.language]));
  }, []);

  useEffect(() => {
    if (typeof identity !== 'string') return;

    storeLocaleIfPossible(identity, locale);
  }, [identity, locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      applySettingsLocale,
      t: (key, vars) => interpolate(messages[locale][key], vars),
    }),
    [locale, setLocale, applySettingsLocale],
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
