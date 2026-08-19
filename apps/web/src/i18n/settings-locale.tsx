'use client';

import { useAuth } from '@clerk/nextjs';
import { userSettingsControllerReadOptions } from '@rondo/api-client/react-query';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useTranslations } from '@/i18n/locale-context';

/**
 * Brings the interface language from the user's settings (F1.6), and renders nothing.
 *
 * A component rather than a hook inside the provider because of where the two things live:
 * the query needs the `QueryClient` and the Clerk token that `ApiProvider` supplies, while the
 * locale lives in `LocaleProvider`, which is `ApiProvider`'s ancestor. Sitting here it can
 * reach both, and nothing has to be reordered.
 *
 * This is also the call that creates the settings row: `GET /user-settings` is get-or-create,
 * so the first authenticated page load of a new account is what decides their language from
 * `Accept-Language` — which the browser sends on its own.
 */
export function SettingsLocaleSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { applySettingsLocale } = useTranslations();

  // `undefined` until Clerk answers, `null` when nobody is signed in. Two different questions:
  // reporting "not yet known" as "nobody" files a pick made in that first beat under the
  // signed-out key, and the interface then snaps back the moment the identity resolves.
  let caller: string | null | undefined;
  if (isLoaded) {
    caller = isSignedIn ? (userId ?? null) : null;
  }

  // Held back until Clerk has a session, so a signed-out visitor on the sign-in screen does
  // not fire a call that could only come back 401.
  const { data } = useQuery({
    ...userSettingsControllerReadOptions(),
    enabled: typeof caller === 'string',
  });

  const language = data?.language;

  // One effect carrying both halves, keyed on the values rather than on `data` — which is a new
  // reference after every refetch, and re-applying the settings on each one would quietly undo
  // a choice the user made in between. The caller travels with the language on purpose:
  // reported separately, a change of identity and the arrival of the new user's settings are
  // two effects with no ordering between them, and the losing order applies one user's language
  // under another's name.
  useEffect(() => {
    applySettingsLocale(caller, language ?? null);
  }, [caller, language, applySettingsLocale]);

  return null;
}
