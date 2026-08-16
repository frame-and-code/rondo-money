# @rondo/web

Rondo Money frontend on **Next.js (App Router)** — skeleton F0.5.

The app shell is in place: sign-in and route protection (F1.1), the shadcn/ui base from
`@rondo/ui` (F0.6) and the locale switcher (F0.7). Still ahead: the full navigation
skeleton (Phase 3) and the typed API client `@rondo/api-client` (F1.4, ADR-002) — until
then `src/lib/api` holds a hand-written client.

## Structure

```text
src/
  app/
    layout.tsx                # root layout (html/body, providers, metadata)
    page.tsx                  # home page — also the F0.6/F0.7 demo screen: primitives,
                              # theme toggle, locale switcher, the API address
    globals.css               # Tailwind entry point + the theme's CSS variables
    sign-in/[[...sign-in]]/   # the only public screen (Clerk catch-all route)
    api/health/route.ts       # liveness probe for Railway — public, answers 200 flat
    (app)/                    # route group for the future app shell (Phase 3)
      layout.tsx
      budget/page.tsx         # budget screen placeholder (/budget)
  components/                 # app-level components (Clerk provider wrapper, locale switcher)
  i18n/                       # ru (default) / en / pl — dictionaries, detection, context
  lib/api/                    # base API client (address comes from env)
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
