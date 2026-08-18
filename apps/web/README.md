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
  i18n/                       # ru (default) / en / pl — dictionaries, detection, context
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

The query cache is scoped to the signed-in user by construction: `ApiProvider` keys it on the
Clerk user id, so signing in as someone else on the same tab starts from an empty cache instead
of serving the previous user's data until a refetch lands.

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
