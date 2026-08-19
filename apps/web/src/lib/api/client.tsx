'use client';

import { useAuth } from '@clerk/nextjs';
import { configureApiClient } from '@rondo/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { API_BASE_URL } from './config';

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

  const [client] = useState(() => new QueryClient());
  const [identity, setIdentity] = useState<string | null | undefined>(undefined);

  // One cache per identity, done by emptying the cache rather than by handing out a new
  // client. Query keys carry no user in them and this provider never unmounts on soft
  // navigation, so without this, signing out and back in as someone else on the same tab would
  // serve the previous user's cached data until a refetch landed.
  //
  // It used to build a new `QueryClient` instead, and that did not work: `useBaseQuery` binds
  // its observer to the client once — `const [observer] = React.useState(() => new
  // Observer(client, defaultedOptions))` in @tanstack/react-query@5.101.4 — and afterwards only
  // calls `observer.setOptions`, which does not rebind it. A screen already on the page
  // therefore kept reading the cache it started with, which is exactly the case this guard
  // exists for: signing out and back in is a soft navigation, and nothing unmounts.
  //
  // Remounting the subtree per identity would fix that and cost too much: `userId` also goes
  // from `undefined` to the signed-in user on every page load, so the theme provider and every
  // screen would be torn down and rebuilt once per load, not once per change of user.
  //
  // Cleared during render, next to the state update, for the same reason the configuration
  // above is: a parent renders before its children, so the first render they do after the
  // identity changes already sees an empty cache. From an effect, one render — and any effect
  // keyed on what it returned — would observe the previous user's response first. Emptying an
  // already-empty cache is a no-op, which is all the first `undefined` → user transition is.
  //
  // It waits for `isLoaded`, because Clerk reports `userId: undefined` until it has a session —
  // reacting to that would clear the cache once on every page load for nothing.
  if (isLoaded && identity !== userId) {
    setIdentity(userId);
    client.clear();
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
