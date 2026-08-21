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
  applySettingsLocale: (userId: string | null | undefined, locale: Locale | null) => void;
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
    // eslint-disable-next-line no-empty -- best effort, as the name says: a browser refusing to store a preference must not break the language switch
  } catch {}
}

interface SettingsBinding {
  identity: string | null | undefined;
  locale: Locale | null;
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
    locale: null,
  });
  const [chosen, setChosen] = useState<Locale | null>(null);
  const [fromBrowser, setFromBrowser] = useState<Locale | null>(null);

  const unfiledPick = useRef<Locale | null>(null);

  const { identity } = settings;

  const locale = chosen ?? settings.locale ?? fromBrowser ?? initialLocale;

  const setLocale = useCallback(
    (next: Locale) => {
      setChosen(next);

      if (identity === undefined) {
        unfiledPick.current = next;
        return;
      }

      storeLocaleIfPossible(identity, next);
    },
    [identity],
  );

  const applySettingsLocale = useCallback(
    (identity: string | null | undefined, next: Locale | null) => {
      setSettings((current) =>
        current.identity === identity && current.locale === next
          ? current
          : { identity, locale: next },
      );
    },
    [],
  );

  useLayoutEffect(() => {
    if (identity === undefined) {
      setChosen(readStoredLocale(null));
      return;
    }

    const unfiled = unfiledPick.current;
    unfiledPick.current = null;

    if (unfiled !== null) {
      storeLocaleIfPossible(identity, unfiled);
      setChosen(unfiled);
      return;
    }

    setChosen(readStoredLocale(identity));
  }, [identity]);

  useEffect(() => {
    setFromBrowser(detectBrowserLocale(navigator.languages ?? [navigator.language]));
  }, []);

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
