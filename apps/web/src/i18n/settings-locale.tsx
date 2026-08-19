'use client';

import { useAuth } from '@clerk/nextjs';
import { userSettingsControllerReadOptions } from '@rondo/api-client/react-query';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useTranslations } from '@/i18n/locale-context';

/** The React key standing in for "nobody is signed in", since a key cannot be null. */
const ANONYMOUS = 'anonymous';

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

  // `undefined` until Clerk answers, `null` when nobody is signed in. Two different questions:
  // reporting "not yet known" as "nobody" files a pick made in that first beat under the
  // signed-out key, and the interface then snaps back the moment the identity resolves.
  let caller: string | null | undefined;
  if (isLoaded) {
    caller = isSignedIn ? (userId ?? null) : null;
  }

  // Remounted whenever the caller changes, deliberately. `ApiProvider` gives each identity its
  // own `QueryClient`, but that only reaches components mounted *after* the swap: `useBaseQuery`
  // builds its observer once — `const [observer] = useState(() => new Observer(client, …))` in
  // @tanstack/react-query@5.101.4 — so a hook that stays mounted keeps reading the cache it
  // started with. This one lives in the root layout and never unmounts on its own, and signing
  // in as someone else on the same tab is a soft navigation; without the key, the second user
  // would be handed the first one's language. Remounting costs nothing here — it renders null.
  //
  // The key and the prop come from one expression on purpose: two of them could disagree, and
  // the disagreement would be a query for one user reported as another's.
  return <CallerSettingsLocale key={caller ?? ANONYMOUS} userId={caller} />;
}

function CallerSettingsLocale({ userId }: { userId: string | null | undefined }) {
  const { applySettingsLocale } = useTranslations();

  // Held back until Clerk has a session, so a signed-out visitor on the sign-in screen does
  // not fire a call that could only come back 401.
  const { data } = useQuery({
    ...userSettingsControllerReadOptions(),
    enabled: typeof userId === 'string',
  });

  // Keyed on the value rather than on `data`, which is a new reference after every refetch —
  // re-applying the settings on each one would quietly undo a choice made in between. The
  // caller travels with it: reported separately, a change of identity and the arrival of the
  // new user's language are two effects with no ordering between them.
  const language = data?.language;

  useEffect(() => {
    applySettingsLocale(userId, language ?? null);
  }, [userId, language, applySettingsLocale]);

  return null;
}
