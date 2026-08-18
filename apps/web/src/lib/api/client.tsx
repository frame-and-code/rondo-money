'use client';

import { useAuth } from '@clerk/nextjs';
import { configureApiClient } from '@rondo/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { API_BASE_URL } from './config';

/** What the current cache was built for. `undefined` means "not bound to an identity yet". */
interface IdentityScopedCache {
  identity: string | null | undefined;
  client: QueryClient;
}

/**
 * Everything this app needs to talk to `@rondo/api` (ADR-002): the generated client pointed
 * at the configured API and taught how to get a Clerk token, plus the TanStack Query cache
 * the screens read through.
 *
 * The client and its types are generated from the API's own OpenAPI spec — this module only
 * supplies the two things generated code cannot know: which API, and how to authenticate.
 * It decides nothing about *when* to send a token: each generated request function carries
 * the security its operation declares, so the public healthcheck stays anonymous without
 * anything here listing which paths are open.
 *
 * Must sit inside `ClerkProvider` — `useAuth()` comes from there.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken, userId, isLoaded } = useAuth();

  // Configured during render rather than in an effect, because a parent's effects run *after*
  // its children's: an effect here would configure the client only once the first screen had
  // already fired its query against an unconfigured one.
  //
  // The `window` guard is load-bearing, not a nicety. `@rondo/api-client` holds a single
  // client per *process*, and Next renders client components on the server too — so
  // configuring during SSR would write one visitor's token reader into an object shared by
  // every concurrent request, and whichever render finished last would win. Nothing on the
  // server uses this client; leaving it unconfigured there is what keeps that safe, and what
  // makes the rule in `.claude/rules/architecture.md` true rather than aspirational.
  if (typeof window !== 'undefined') {
    configureApiClient({ baseUrl: API_BASE_URL, getToken });
  }

  const [cache, setCache] = useState<IdentityScopedCache>(() => ({
    identity: undefined,
    client: new QueryClient(),
  }));

  // A cache per identity. Query keys carry no user in them and this provider never unmounts on
  // soft navigation, so without this, signing out and back in as someone else on the same tab
  // would serve the previous user's cached data until a refetch landed.
  //
  // Two details matter. It waits for `isLoaded`, because Clerk reports `userId: undefined`
  // until it has a session — reacting to that would rebuild the cache once on every page load
  // for nothing. And it *swaps the client* rather than remounting the subtree: the children
  // here include the theme provider and every screen, which would lose their state on each
  // change of identity. Adjusting state during render is React's documented alternative to an
  // effect for deriving state from props — the component re-runs before its children render,
  // so nothing below ever reads the previous user's cache, which an effect could not promise.
  if (isLoaded && cache.identity !== userId) {
    setCache({ identity: userId, client: new QueryClient() });
  }

  return <QueryClientProvider client={cache.client}>{children}</QueryClientProvider>;
}
