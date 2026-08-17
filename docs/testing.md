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

The same, targeted: `pnpm --filter @rondo/api test:integration` etc.

### Prerequisites

- **Integration and e2e** hit the local Postgres from F0.3: `docker compose up -d`
  (+ `pnpm db:migrate` if new migrations appeared).
- **E2E, once**: download the browser — `pnpm --filter @rondo/web exec playwright install chromium`.
- E2E builds and starts api (`node dist/main.js`) and web (`next dev`) itself; servers
  already running locally are reused (`reuseExistingServer`).
- ⚠️ Because e2e runs `next dev`, Next rewrites `apps/web/next-env.d.ts` to its dev variant
  (`./.next/dev/types/…`). The committed file must stay on the build variant
  (`./.next/types/…`) — that is what CI and `next build` produce, and the dev paths do not
  exist there, which silently disables typed-route checking. After a local e2e run the file
  shows up as modified: discard it (`git checkout -- apps/web/next-env.d.ts`) instead of
  sweeping it into a commit with `git add -A`.
- **E2E needs the Clerk keys** (F1.1) in `apps/web/.env.local` — `pnpm env:setup`;
  Playwright loads that file itself (`@next/env` in `e2e/global-setup.ts`). Without the
  keys the auth scenarios are skipped locally, while **in CI their absence fails the
  run** — a green gate must never mean "auth was never tested".
- **And the api's own key** (F1.2) in `apps/api/.env.local` — the same `pnpm env:setup`
  writes it. Playwright starts the api before `globalSetup` loads any `.env`, so the api
  reads the key from that file rather than from the environment; without it the server
  exits at startup and every scenario fails on an unreachable web server. A machine set up
  before F1.2 needs `pnpm env:setup` re-run.

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

### Auth in api tests (F1.2)

The guard is global, so every api test that hits a protected route needs a token — and
none of them may reach Clerk over the network:

- [`apps/api/test/clerk-token.ts`](../apps/api/test/clerk-token.ts) generates an RSA key
  pair in the test process and signs Clerk-shaped JWTs with it.
- The spec puts the matching PEM public key in `CLERK_JWT_KEY` before booting the module.
  The guard prefers that variable, so the **real** `verifyToken()` runs — real signature
  and expiry checks — with no JWKS fetch and no dependency on a Clerk instance. Example:
  [`apps/api/test/auth.integration.spec.ts`](../apps/api/test/auth.integration.spec.ts).
- Mocking `verifyToken()` instead would leave the one thing worth proving untested; the
  key pair costs milliseconds.

## How to add tests to a new feature

1. **Domain logic** (money, budget calculations, DTOs) → a unit test next to the package
   where it lives (usually `packages/types/test/*.spec.ts`). Reach for **fast-check** when
   the claim holds over a whole space of inputs — an invariant or a round-trip law —
   example: [`packages/types/test/money.spec.ts`](../packages/types/test/money.spec.ts).
   Invariant 5.5 (`RTA + Σ Available = Σ Balance`) is checked exactly this way from Phase 4.
   It is **not** the default for every spec: a named set of cases (an endpoint's rejection
   reasons, a two-branch config lookup, the casings of a header) is covered by enumerating
   them. Generating over that space proves the standard library works, and buys it with a
   dependency and a slower suite.
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
  ESLint config (`@rondo/config/eslint`); in Playwright specs, `test`/`expect` are imported.
- Turbo doesn't cache integration and e2e (external state — the DB); the unit level is cached.
- Jest always collects coverage — every unit/integration run writes `coverage/lcov.info`
  into the workspace (git-ignored). The `sonar` CI job imports those files into SonarQube
  Cloud (see [ci.md](ci.md)); the lcov reporter's `projectRoot` option keeps the paths
  repo-root-relative, which the Sonar scanner requires — copy it along when adding a jest
  config to a new package, and list the new lcov in `sonar-project.properties`.
