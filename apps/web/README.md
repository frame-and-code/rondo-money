# @rondo/web

Rondo Money frontend on **Next.js (App Router)** — skeleton F0.5.

The app shell is in place: sign-in and route protection (F1.1), the shadcn/ui base from
`@rondo/ui` (F0.6), the locale switcher (F0.7) and the typed API client `@rondo/api-client`
(F1.4, ADR-002), which `src/lib/api` wires to the Clerk session and to TanStack Query — server
state lives in that cache, not in component state. Still ahead: the full navigation skeleton
and the real screens (Phase 3).

## Structure

```text
src/
  app/
    layout.tsx                # root layout (html/body, providers, metadata)
    page.tsx                  # home page — also the F0.6/F0.7 demo screen: primitives,
                              # theme toggle, locale switcher, the API address, and the
                              # first authenticated API call (GET /me, F1.4)
    globals.css               # Tailwind entry point + the theme's CSS variables
    sign-in/[[...sign-in]]/   # the only public screen (Clerk catch-all route)
    api/health/route.ts       # liveness probe for Railway — public, answers 200 flat
    (app)/                    # route group for the future app shell (Phase 3)
      layout.tsx
      budget/page.tsx         # budget screen placeholder (/budget)
  components/                 # app-level components (Clerk provider wrapper, locale switcher)
  i18n/                       # ru / en / pl — dictionaries, detection, context. English is
                              # the fallback (F1.6); settings-locale.tsx feeds the language
                              # from GET /user-settings back into the locale context
  lib/api/                    # the only way to reach @rondo/api: ApiProvider wires the
                              # generated client (@rondo/api-client) to the address, the
                              # Clerk token and the TanStack Query cache
  lib/auth.ts                 # SIGN_IN_URL and HEALTH_URL — the paths proxy.ts,
                              # railway.json and the routes must agree on
  proxy.ts                    # clerkMiddleware: everything is protected except the
                              # public matcher (sign-in, the health route)
```

## Running

```bash
pnpm --filter @rondo/web dev     # next dev on :3001 (API takes :3000)
pnpm --filter @rondo/web build   # next build (standalone build for Railway)
pnpm --filter @rondo/web start   # next start on :3001
pnpm --filter @rondo/web test    # jest — smoke test of the home page render
pnpm test:e2e                   # Playwright — incl. the F1.1 sign-in/out scenarios
```

All pages are Clerk-protected (F1.1): anonymous visitors are redirected to `/sign-in`
by `src/proxy.ts` (`clerkMiddleware` + `auth.protect()`).

## Data from the API

`ApiProvider` (in [src/lib/api](src/lib/api/client.tsx), mounted in the root layout) configures
the generated client once — base URL, Clerk token, TanStack Query cache. Screens then only ask
for data:

```tsx
import { meControllerIdentifyOptions } from '@rondo/api-client/react-query';

const { data, isError } = useQuery(meControllerIdentifyOptions());
```

There is no token handling at the call site, and there should never be: each generated request
carries the security its operation declares in the OpenAPI spec, so `GET /me` is sent with a
bearer token and the public healthcheck without one. Which endpoints are open is decided by
`@Public()` in `apps/api` — web holds no list of them.

The provider configures that client **in the browser only**. It is a single instance per
process, so configuring it while Next renders on the server would hand one visitor's token to
every concurrent request — server code therefore gets a deliberately unconfigured client.
Nothing needs one yet; when something does, it builds its own per request from `await auth()`
and passes it explicitly, in this same `src/lib/api` module rather than in a hand-written
`fetch`.

`ApiProvider` builds a fresh query cache per Clerk user id, so anything mounted after a change
of identity starts from an empty cache rather than the previous user's data.

⚠️ **It does not reach a screen that is already on the page**, which is the case it was written
for: signing out and back in is a soft navigation, and nothing unmounts. `useBaseQuery` builds
its observer once and never rebinds it to a new client (verified against the installed
`@tanstack/react-query@5.101.4` in F1.6), so a mounted `useQuery` keeps reading the cache it
started with. Fixing the provider is tracked separately; until then, a component that must not
be handed the previous user's data remounts itself per identity — see
[settings-locale.tsx](src/i18n/settings-locale.tsx).

The first thing the app asks for is the user's own settings.
[`SettingsLocaleSync`](src/i18n/settings-locale.tsx) sits in the root layout, renders nothing,
and calls `GET /user-settings` as soon as there is a session — which is also what creates that
row, since the endpoint is get-or-create (F1.6). Three sources can decide the interface
language, and [`locale-context.tsx`](src/i18n/locale-context.tsx) holds the order in one
expression: **the user's own pick** (kept in `localStorage`, because `PATCH /user-settings` is
Phase 7 and the sign-in screen has no session to read settings with) beats **the account's
settings**, which beat **the browser**. Reversing the last two would hand the choice back to
the server on every reload, which is the defect the storage exists to remove.

Both of the first two are scoped to the signed-in account, because browsers get shared. The
stored pick lives under `rondo.locale:<userId>` (a signed-out visitor gets the bare
`rondo.locale` — that is the sign-in screen, which belongs to no account), and the settings
reader is remounted per caller. The remount is not decoration: `ApiProvider` gives each
identity its own `QueryClient`, but a `useQuery` that stays mounted keeps the client it was
created with, so a component living in the root layout would go on reading the previous user's
cache after a sign-out and back in. Storage access is also wrapped — Safari with "Block All
Cookies" and a sandboxed iframe throw on reading `window.localStorage` at all, and this
provider sits above every screen with no error boundary under it.

## Environment

The env contract lives in [.env.local.tpl](.env.local.tpl) (there is no separate
`.env.example`). Generate `apps/web/.env.local` from it:

```bash
pnpm env:setup   # at the repo root; needs the 1Password CLI (see setup-env.sh)
```

Without 1Password, copy the template to `.env.local` and fill the `{{ op://... }}`
references by hand.

- `NEXT_PUBLIC_API_URL` — base address of `@rondo/api`. The value is inlined into the
  browser bundle (`NEXT_PUBLIC_*`), defaults to `http://localhost:3000`. On Railway it
  points to the deployed API.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk authentication
  (F1.1), **required**: without them `clerkMiddleware` rejects every request. Take both
  from [dashboard.clerk.com](https://dashboard.clerk.com) → your application → API Keys
  (the dev instance); the instance must have the **email verification code** sign-in
  method enabled (e2e test accounts use it). The publishable key is inlined into the
  bundle at build time; the secret key is server-only.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@rondo/config/tsconfig/base.json` we add `jsx: preserve`,
  DOM libraries and the `next` plugin. The base is already ESM/bundler-oriented — exactly
  what App Router needs, so we only duplicate the Next-specific bits.
- **Browser globals in ESLint:** the shared base registers only `globals.node`;
  here `globals.browser` is added on top for client code (otherwise `no-undef`
  on `window`/`document`).
- **`@/` alias:** `@/* → src/*` was set in F0.2; Next resolves it natively — no extra
  configuration needed.
