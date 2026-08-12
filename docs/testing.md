# Tests (F0.8 — test harness)

Three levels, all run through Turborepo. Project rule: **tests are written together with
the feature** — a feature without tests doesn't count as done (no test debt accrual).

## Levels

| Level       | What it checks                              | Runner              | Where it lives                                     | Naming                     |
| ----------- | ------------------------------------------- | ------------------- | -------------------------------------------------- | -------------------------- |
| Unit        | Domain logic, components — no DB or network | Jest (+ fast-check) | `packages/types/test`, `apps/web/test`, `apps/api` | `*.spec.ts` / `*.test.tsx` |
| Integration | API ↔ Postgres (from F0.3)                  | Jest + supertest    | `apps/api/test`                                    | `*.integration.spec.ts`    |
| E2E         | Browser → web → api → Postgres              | Playwright          | `apps/web/e2e`                                     | `*.spec.ts`                |

## Commands

```bash
pnpm test               # all levels in all workspaces (turbo run test)
pnpm test:unit          # unit only
pnpm test:integration   # integration only (needs Postgres)
pnpm test:e2e           # e2e only (needs Postgres; Playwright starts the servers itself)
```

The same, targeted: `pnpm --filter @ffai/api test:integration` etc.

### Prerequisites

- **Integration and e2e** hit the local Postgres from F0.3: `docker compose up -d`
  (+ `pnpm db:migrate` if new migrations appeared).
- **E2E, once**: download the browser — `pnpm --filter @ffai/web exec playwright install chromium`.
- E2E builds and starts api (`node dist/main.js`) and web (`next dev`) itself; servers
  already running locally are reused (`reuseExistingServer`).
- **E2E needs the Clerk keys** (F1.1) in `apps/web/.env.local` — `pnpm env:setup`;
  Playwright loads that file itself (`@next/env` in `e2e/global-setup.ts`). Without the
  keys the auth scenarios are skipped locally, while **in CI their absence fails the
  run** — a green gate must never mean "auth was never tested".

### Auth in e2e (F1.1)

All app routes are behind Clerk, so any scenario touching a screen needs a session:

- The Clerk **dev instance** treats `<name>+clerk_test@example.com` as a test account:
  the OTP is always `424242` and no real mail is sent. The address lives in
  [`apps/web/e2e/clerk.ts`](../apps/web/e2e/clerk.ts).
- [`e2e/global-setup.ts`](../apps/web/e2e/global-setup.ts) issues the Clerk **Testing
  Token** (`@clerk/testing` — bypasses bot detection for automated browsers) and creates
  that account through the Backend API, idempotently — a fresh instance needs no manual
  setup.
- In a spec: call `setupClerkTestingToken({ page })`, then sign in programmatically with
  `clerk.signIn(...)` (strategy `email_code`) on a page where clerk-js is loaded —
  the public `/sign-in`. Example:
  [`apps/web/e2e/auth.spec.ts`](../apps/web/e2e/auth.spec.ts).

## How to add tests to a new feature

1. **Domain logic** (money, budget calculations, DTOs) → a unit test next to the package
   where it lives (usually `packages/types/test/*.spec.ts`). For invariants and conventions,
   write property-based tests with **fast-check** — example:
   [`packages/types/test/money.spec.ts`](../packages/types/test/money.spec.ts).
   Invariant 5.5 (`RTA + Σ Available = Σ Balance`) is checked exactly this way from Phase 4.
2. **Endpoint / DB work** → `apps/api/test/<feature>.integration.spec.ts`: bring up
   the real `AppModule` via `@nestjs/testing` + supertest — example:
   [`apps/api/test/health.integration.spec.ts`](../apps/api/test/health.integration.spec.ts).
   api unit tests (no DB) — regular `*.spec.ts` next to the code or in `test/`.
3. **Component / page** → a jsdom test in `apps/web/test` (Testing Library).
4. **User scenario** (a whole screen, web + api) → `apps/web/e2e/<feature>.spec.ts` —
   example: [`apps/web/e2e/home.spec.ts`](../apps/web/e2e/home.spec.ts). E2E is the most
   expensive level: one or two scenarios per feature, cover the rest lower down.
5. Package has no runner yet? Copy `jest.config.mjs` from `packages/types` (node) or
   `apps/web` (jsdom), add `test` / `test:unit` scripts — turbo picks them up automatically.

## Conventions

- Integration tests run **sequentially** (`--runInBand`) — shared DB, no races.
- Test files must be in the `include` of the corresponding `tsconfig.json` — otherwise
  `typecheck` and type-aware lint (`no-floating-promises` in api) won't see them.
- Jest globals (`describe` / `it` / `expect`) are registered for test files in the shared
  ESLint config (`@ffai/config/eslint`); in Playwright specs, `test`/`expect` are imported.
- Turbo doesn't cache integration and e2e (external state — the DB); the unit level is cached.
