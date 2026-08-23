# @rondo/web

Rondo Money frontend on **Next.js (App Router)**.

The app shell is in place: a persistent navigation over its sections, sign-in and route
protection, the shadcn/ui base from `@rondo/ui`, the locale switcher and the typed API client
`@rondo/api-client` (ADR-002), which `src/lib/api` wires to the Clerk session and to TanStack
Query. Server state lives in that cache, not in component state. Each section is a slot: the
real screens behind them are still ahead.

## Structure

```text
src/
  app/
    layout.tsx                # root layout (html/body, providers, metadata)
    page.tsx                  # home page — also the F0.6/F0.7 demo screen: primitives,
                              # theme toggle, locale switcher, the API address, and the
                              # first authenticated API call (GET /me, F1.4)
    globals.css               # Tailwind entry point + the theme's CSS variables. `--font-sans`
                              # points at the variable `next/font` sets in layout.tsx, so a
                              # font name written back into that line silently drops the font
    sign-in/[[...sign-in]]/   # the only public screen (Clerk catch-all route)
    api/health/route.ts       # liveness probe for Railway — public, answers 200 flat; also
                              # reports the mode the bundle was built in, which is what e2e
                              # read to refuse a dev server (F1.11)
    (app)/                    # the app shell: a sidebar on desktop, a bottom tab bar on a
                              # phone, and the sections it navigates
      layout.tsx              # renders AppShell around every section
      categories/             # each section is page.tsx (the slot) + loading.tsx (skeletons)
      accounts/
      net-worth/
      settings/
  components/                 # app-level components: the shell and its navigation, the
                              # section slot, the loading region, the Clerk provider wrapper
                              # and the locale switcher
  i18n/                       # ru / en / pl — dictionaries, detection, context. English is
                              # the fallback (F1.6); settings-locale.tsx feeds the language
                              # from GET /user-settings back into the locale context
  lib/api/                    # the only way to reach @rondo/api: ApiProvider wires the
                              # generated client (@rondo/api-client) to the address, the
                              # Clerk token and the TanStack Query cache
  lib/sections.ts             # the sections in one place: route, message key, icon.
                              # The navigation and the header title both read it
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
pnpm --filter @rondo/web test    # unit, then e2e (see docs/testing.md for prerequisites)
pnpm test:e2e                   # Playwright — incl. the F1.1 sign-in/out scenarios
```

E2E build the app and serve it with `next start` (F1.11), never `next dev`, which is a
different application and would make a green suite meaningless as evidence about the deployed
one. So a run costs a build (about 5 seconds when nothing changed), and Playwright refuses a
`pnpm dev` server on :3001 rather than reusing it. Don't park a production server there either.
The refusal reads the build's mode, not its age, so a stale one would be reused silently.
Details in [docs/testing.md](../../docs/testing.md).

All pages are Clerk-protected (F1.1). `src/proxy.ts` redirects anonymous visitors to
`/sign-in` (`clerkMiddleware` + `auth.protect()`).

## Data from the API

`ApiProvider` (in [src/lib/api](src/lib/api/client.tsx), mounted in the root layout) configures
the generated client once, with the base URL, the Clerk token and the TanStack Query cache.
Screens then only ask for data:

```tsx
import { meControllerIdentifyOptions } from '@rondo/api-client/react-query';

const { data, isError } = useQuery(meControllerIdentifyOptions());
```

There is no token handling at the call site, and there should never be. Each generated request
carries the security its operation declares in the OpenAPI spec, so `GET /me` is sent with a
bearer token and the public healthcheck without one. `@Public()` in `apps/api` decides which
endpoints are open, and web holds no list of them.

It configures during render, not in an effect. A parent's effects run after its children's, so
an effect would let the first screen fire against an unconfigured client, and the cache is
cleared during render for the same reason. The `isLoaded` guard is separate. Clerk reports
`userId: undefined` until it has a session, and reacting to that would empty the cache on every
page load for nothing.

The provider configures that client **in the browser only**. It is a single instance per
process, so configuring it while Next renders on the server would hand one visitor's token to
every concurrent request. Server code therefore gets a deliberately unconfigured client.
Nothing needs one yet; when something does, it builds its own per request from `await auth()`
and passes it explicitly, in this same `src/lib/api` module rather than in a hand-written
`fetch`.

`ApiProvider` empties the query cache when the Clerk user id changes, so signing out and back
in as someone else on the same tab starts from nothing rather than serving the previous user's
data, including to screens that were already on the page.

That last part is the whole point, and it is why the provider _clears_ one cache instead of
handing out a new one, which is what it did until F1.6. `useBaseQuery` binds its observer to a
client once and never rebinds it (verified against the installed
`@tanstack/react-query@5.101.4`), so replacing the client reached only what mounted afterwards.
Signing out and back in is a soft navigation, so nothing unmounts. Remounting the subtree
per identity would also work and costs far too much. `userId` goes from `undefined` to the
signed-in user on every page load, so the theme provider and every screen would be rebuilt once
per load rather than once per user.

The first thing the app asks for is the user's own settings.
[`SettingsLocaleSync`](src/i18n/settings-locale.tsx) sits in the root layout, renders nothing,
and calls `GET /user-settings` as soon as there is a session. That call is also what creates
the row, since the endpoint is get-or-create (F1.6). Three sources can decide the interface
language, and [`locale-context.tsx`](src/i18n/locale-context.tsx) holds the order in one
expression: **the user's own pick** (kept in `localStorage`, because `PATCH /user-settings` is
Phase 7 and the sign-in screen has no session to read settings with) beats **the account's
settings**, which beat **the browser**. Reversing the last two would hand the choice back to
the server on every reload, which is the defect the storage exists to remove.

Both of the first two are scoped to the signed-in account, because browsers get shared. The
stored pick lives under `rondo.locale:<userId>`, and a signed-out visitor gets the bare
`rondo.locale`, which is the sign-in screen, belonging to no account. The settings
language is reported together with the user it belongs to, so a language arriving for the
previous account cannot be applied to the next one. Storage access is wrapped as well. Safari
with "Block All Cookies" and a sandboxed iframe throw on reading `window.localStorage` at all,
and this provider sits above every screen with no error boundary under it.

## Environment

The env contract lives in [.env.local.tpl](.env.local.tpl) (there is no separate
`.env.example`). Generate `apps/web/.env.local` from it:

```bash
pnpm env:setup   # at the repo root; needs the 1Password CLI (see setup-env.sh)
```

Without 1Password, copy the template to `.env.local` and fill the `{{ op://... }}`
references by hand.

- `NEXT_PUBLIC_API_URL` is the base address of `@rondo/api`. Next inlines the value into the
  browser bundle (`NEXT_PUBLIC_*`), and it defaults to `http://localhost:3000`. On Railway it
  points to the deployed API.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` carry Clerk authentication
  (F1.1) and are **required**. Without them `clerkMiddleware` rejects every request. Take both
  from [dashboard.clerk.com](https://dashboard.clerk.com) → your application → API Keys
  (the dev instance); the instance must have the **email verification code** sign-in
  method enabled (e2e test accounts use it). The publishable key is inlined into the
  bundle at build time; the secret key is server-only.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@rondo/config/tsconfig/base.json` we add `jsx: preserve`,
  DOM libraries and the `next` plugin. The base is already ESM/bundler-oriented, exactly
  what App Router needs, so we only duplicate the Next-specific bits.
- **Browser globals in ESLint:** the shared base registers only `globals.node`;
  here `globals.browser` is added on top for client code (otherwise `no-undef`
  on `window`/`document`).
- **`@/` alias:** `@/* → src/*` was set in F0.2; Next resolves it natively, with no extra
  configuration needed.
