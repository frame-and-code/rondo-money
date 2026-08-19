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
  /** The user's own pick. Persisted, and from then on it outranks every other source. */
  setLocale: (locale: Locale) => void;
  /**
   * What the API reports for the signed-in user (F1.6): who they are, and what their settings
   * say. The caller is `undefined` until Clerk answers and `null` when nobody is signed in —
   * two different questions, and collapsing them loses a pick made in the first second of a
   * page load. The language is `null` while it is still unknown. Called from inside
   * `ClerkProvider`, because this provider is its ancestor and cannot read the session itself.
   *
   * The two travel together deliberately. Reported separately, a change of identity and the
   * arrival of the new user's language are two effects with no ordering between them, and the
   * losing order silently clears the value that had just been applied.
   *
   * A suggestion, not a decision: the language is applied only while the user has not chosen
   * for themselves on this device.
   */
  applySettingsLocale: (userId: string | null | undefined, locale: Locale | null) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Where a user's own choice is kept until the server learns about it.
 *
 * Local to the device on purpose: `PATCH /user-settings` is Phase 7, so until then this is
 * the only memory the choice has — including on the sign-in screen, which has no settings to
 * read because it has no session.
 */
const STORAGE_KEY = 'rondo.locale';

/**
 * The entry a pick belongs to.
 *
 * Keyed by the signed-in user, because browsers get shared. A single device-wide entry would
 * hand the next person to sign in the previous one's language — and, since a pick outranks the
 * account's own settings, never give it back. A signed-out visitor gets the bare key: that is
 * the sign-in screen, which belongs to no account.
 *
 * A pick therefore does not follow someone across the sign-in itself: choose Polish while
 * signed out and your account says English, and signing in gives you English. That is the
 * deliberate half of the trade — the alternative that carries it over is a *move*, which would
 * leave the next anonymous visitor without one, or a *copy*, which is the shared-browser bug
 * again. Phase 7 removes the question by putting the pick on the server.
 */
function storageKey(userId: string | null): string {
  return userId === null ? STORAGE_KEY : `${STORAGE_KEY}:${userId}`;
}

/**
 * `window.localStorage` is not always reachable: Safari with "Block All Cookies" and a
 * sandboxed iframe throw `SecurityError` on the property itself, and a private-mode write can
 * throw `QuotaExceededError`. This provider sits directly under `<body>` with no error boundary
 * beneath it, so an unhandled throw here is a blank app rather than a lost preference — and a
 * lost preference is the right degradation: the precedence below is untouched, the pick simply
 * does not outlive the tab.
 */
function readStoredLocale(userId: string | null): Locale | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }

  return stored !== null && isLocale(stored) ? stored : null;
}

function storeLocale(userId: string | null, locale: Locale): void {
  try {
    window.localStorage.setItem(storageKey(userId), locale);
  } catch {
    // Unreachable storage — see readStoredLocale. The pick still applies to this tab.
  }
}

/** What the API said about the user who is signed in right now. */
interface SettingsBinding {
  /** Whose settings these are: `undefined` until Clerk answers, `null` while signed out. */
  identity: string | null | undefined;
  /** What they say, or `null` while the answer has not arrived yet. */
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

  /**
   * A pick made before Clerk answered, held until there is a key to file it under.
   *
   * A ref rather than state: the effect below has to read it without re-running every time
   * someone switches language, and nothing renders from it — the pick is already in `chosen`.
   */
  const unfiledPick = useRef<Locale | null>(null);

  const { identity } = settings;

  // The whole precedence rule, in one line and in one place: what the user picked here beats
  // what their account says, which beats what their browser guesses. The order between the
  // last two is deliberate — until Phase 7 the server never hears about a pick, so letting
  // settings win would undo the choice on the next load, which is the defect this exists to
  // remove.
  const locale = chosen ?? settings.locale ?? fromBrowser ?? initialLocale;

  const setLocale = useCallback(
    (next: Locale) => {
      setChosen(next);

      // Nowhere to file it yet — the switcher is on screen for the beat before Clerk answers,
      // and writing it to the signed-out key would hand it to the wrong owner and then lose it
      // the moment the identity resolved.
      if (identity === undefined) {
        unfiledPick.current = next;
        return;
      }

      storeLocale(identity, next);
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

  // A pick belongs to the account that made it, so a change of identity re-reads it under the
  // new owner's key — which is also what drops it on sign-out, instead of greeting the next
  // visitor to the sign-in screen in the departed user's language. The settings half needs no
  // effect here: it is reset by the same call that changes the identity.
  //
  // A *layout* effect, which React runs before the browser paints. What that buys is exactly
  // one case, and it is worth being precise about which: the **signed-out** key is readable at
  // mount, so the sign-in screen — where a pick is the only memory there is — repaints into it
  // with no flash of the default. A signed-in user's key cannot be read that early, because
  // nobody knows who they are until Clerk answers a beat later; for them the default is painted
  // first, and closing that gap needs the language to come from the server (variant B in
  // ADR-004), not from storage.
  //
  // Not read while the state is initialised, tempting as that is: the server has no storage, so
  // the first client render has to match the markup the server sent or React reports a
  // hydration mismatch and throws that subtree away. Verified rather than assumed — reading it
  // there put "Hydration failed because the server rendered text" in the console of every reload
  // where the stored choice was not the default. `suppressHydrationWarning` on `<html>` does not
  // cover it: it applies to that element, not to text deep in the tree.
  useLayoutEffect(() => {
    // Clerk has not answered, so the only key that can be read is the signed-out one — which is
    // the right one for the sign-in screen, the place this matters most.
    if (identity === undefined) {
      setChosen(readStoredLocale(null));
      return;
    }

    // Consumed, whether or not it is used: it belongs to the first identity to resolve, and a
    // later change of identity must re-read rather than carry someone else's pick over.
    const unfiled = unfiledPick.current;
    unfiledPick.current = null;

    if (unfiled !== null) {
      storeLocale(identity, unfiled);
      setChosen(unfiled);
      return;
    }

    setChosen(readStoredLocale(identity));
  }, [identity]);

  // Browser detection only ever runs client-side. It is the weakest of the three sources, and
  // the expression above is what says so: this still runs when a choice is already stored, and
  // is simply outranked — a guard here would restate the same rule in a second place.
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
