# @ffai/web

Fin Flow AI frontend on **Next.js (App Router)** — skeleton F0.5.

For now this is the app shell: root layout, home page, and a placeholder route
structure for future screens. Full navigation skeleton — Phase 3, UI base
(shadcn/ui) — F0.6, typed API client (`@ffai/api-client`) — F1 (ADR-002).

## Structure

```text
src/
  app/
    layout.tsx          # root layout (html/body, metadata)
    page.tsx            # home page (shows the API address)
    (app)/              # route group for the future app shell (Phase 3)
      layout.tsx
      budget/page.tsx   # budget screen placeholder (/budget)
  lib/api/              # base API client (address comes from env)
```

## Running

```bash
pnpm --filter @ffai/web dev     # next dev on :3001 (API takes :3000)
pnpm --filter @ffai/web build   # next build (standalone build for Railway)
pnpm --filter @ffai/web start   # next start on :3001
pnpm --filter @ffai/web test    # jest — smoke test of the home page render
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

- `NEXT_PUBLIC_API_URL` — base address of `@ffai/api`. The value is inlined into the
  browser bundle (`NEXT_PUBLIC_*`), defaults to `http://localhost:3000`. On Railway it
  points to the deployed API.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk authentication
  (F1.1), **required**: without them `clerkMiddleware` rejects every request. Take both
  from [dashboard.clerk.com](https://dashboard.clerk.com) → your application → API Keys
  (the dev instance); the instance must have the **email verification code** sign-in
  method enabled (e2e test accounts use it). The publishable key is inlined into the
  bundle at build time; the secret key is server-only.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@ffai/config/tsconfig/base.json` we add `jsx: preserve`,
  DOM libraries and the `next` plugin. The base is already ESM/bundler-oriented — exactly
  what App Router needs, so we only duplicate the Next-specific bits.
- **Browser globals in ESLint:** the shared base registers only `globals.node`;
  here `globals.browser` is added on top for client code (otherwise `no-undef`
  on `window`/`document`).
- **`@/` alias:** `@/* → src/*` was set in F0.2; Next resolves it natively — no extra
  configuration needed.
