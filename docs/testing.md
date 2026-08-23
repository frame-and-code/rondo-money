# Tests (F0.8, test harness)

Three levels, all run through Turborepo. Project rule: **tests are written together with
the feature**. A feature without tests doesn't count as done (no test debt accrual).

## Levels

| Level       | What it checks                             | Runner              | Where it lives                                                                 | Naming                  |
| ----------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------ | ----------------------- |
| Unit        | Domain logic, components, no DB or network | Jest (+ fast-check) | `packages/types/test`, `packages/api-client/test`, `apps/web/test`, `apps/api` | see Naming, below       |
| Integration | API ↔ Postgres (from F0.3)                 | Jest + supertest    | `apps/api/test`                                                                | `*.integration.spec.ts` |
| E2E         | Browser → web → api → Postgres             | Playwright          | `apps/web/e2e`                                                                 | `*.spec.ts`             |

Plus one that is not a level of the app at all: **the agent guard hooks and `check-docs.mjs`**
([`.claude/hooks/hooks.test.sh`](../.claude/hooks/hooks.test.sh), `pnpm test:hooks`, a step
of the CI `unit` job). `guard-bash.sh` and `guard-db.sh` are what stop a secret-scan bypass
or a migration against the dev database, and neither announces a miss: `guard-db.sh` matches
patterns against the command string, so it fails by matching nothing and exiting 0, while
`guard-bash.sh` tokenises the command first and can still be wrong about which words matter.
Bash and node only, no Postgres and no keys. A new blocking hook lands with its cases; see
[`.claude/README.md`](../.claude/README.md).

## Commands

```bash
pnpm test               # all levels in all workspaces (turbo run test)
pnpm test:unit          # unit only
pnpm test:integration   # integration only (needs Postgres)
pnpm test:e2e           # e2e only (needs Postgres; Playwright starts the servers itself)
pnpm test:hooks         # the guard hooks and the docs checker — bash, no DB, no secrets
```

The same, targeted: `pnpm --filter @rondo/api test:integration` etc.

### Prerequisites

- **A targeted run needs its workspace dependencies built.** The root commands go through
  turbo, which builds them first; `pnpm --filter` runs the package script directly and does
  not. `@rondo/api` resolves `@rondo/types` through that package's `dist`, so on a fresh clone
  a targeted api run fails on a missing module until `pnpm --filter @rondo/types build`.
  Using the root command avoids that.
- **Integration and e2e** hit the local Postgres from F0.3: `docker compose up -d`
  (+ `pnpm db:migrate` if new migrations appeared).
- **E2E, once**: download the browser with `pnpm --filter @rondo/web exec playwright install chromium`.
- E2E builds and starts both servers itself: api (`node dist/main.js`) and web
  (`next build` + `next start`, see below); servers already running locally are reused
  (`reuseExistingServer`). A **dev server on :3001 aborts the run** rather than being
  replaced, so stop `pnpm dev` (and the one [`/dev`](../.claude/commands/dev.md) starts)
  before running e2e. Stop **all** of it, not only the web half: the api on :3000 is reused
  with no mode probe at all, so a dev api is silently what the suite tests. Since F1.9 that
  dev api also restarts whenever `packages/*/dist` is rewritten, which a root `pnpm test:e2e`
  does itself, and so does any `build`, `test` or `/check` started in another terminal. A
  restart mid-suite reads as an unexplained flake.
- **E2E needs the Clerk keys** (F1.1) in `apps/web/.env.local`, via `pnpm env:setup`. The
  publishable one is needed by the **build**, not at startup: `next build` inlines it into
  the bundle, and `apps/web/check-public-env.mjs` refuses to build without it in CI (locally
  it warns, and the auth scenarios skip themselves). Playwright also loads that file for its
  own use (`@next/env` in `e2e/global-setup.ts`). In CI a missing key **fails the run**. A
  green gate must never mean "auth was never tested".
- **And the api's own key** (F1.2) in `apps/api/.env.local`, which the same `pnpm env:setup`
  writes. Playwright starts the api before `globalSetup` loads any `.env`, so the api
  reads the key from that file rather than from the environment; without it the server
  exits at startup and every scenario fails on an unreachable web server. A machine set up
  before F1.2 needs `pnpm env:setup` re-run.

### E2E run against a production build (F1.11)

Playwright serves web with `next build` + `next start`, never `next dev`. Dev mode is a
different application: no minification, different static optimisation and caching,
different server-component behaviour. So a green suite against it said nothing about what
Railway serves, which is the one thing this level exists to say.

What follows from that:

- **A local run costs a build.** The first one is the slow one; after it, Next's
  `.next/cache` makes the rebuild incremental. CI caches that directory too, and
  deliberately does not reuse the `build` job's output. That job builds without the Clerk
  keys on purpose, and `NEXT_PUBLIC_*` are inlined, so its bundle cannot serve a page.
- **Reuse still works, but only for a production server.** `e2e/global-setup.ts` asks
  `/api/health` which mode the bundle on that port was built in, and fails the run on a dev
  server rather than testing it.
- **Reuse cannot see age, so don't keep a server warm.** A production server built an hour ago
  answers that probe exactly like one built a minute ago. The field comes from the bundle, and
  nothing in it says which sources it came from. So `reuseExistingServer` is for a server this
  suite itself left running, not for one you park in another terminal: after changing app code,
  stop it and let Playwright build. That is the one hole this level still has, and it is cheap
  to stay out of; a no-change rebuild costs about 5 seconds.
- **`apps/web/next-env.d.ts` is no longer in git.** Next rewrites it on every run and writes
  a different variant in each mode; it is an artefact, and Next's own documentation says to
  keep it out of version control. Nothing to discard after a run any more. The one thing to
  know: on a fresh clone `pnpm typecheck` runs before anything has built, so Next's ambient
  declarations are absent. Most code never notices; the stylesheet import in
  `src/app/layout.tsx` type-checks without them (checked). But an import that **binds a
  value** does: `import logo from './logo.png'` fails with `TS2307` until something has
  written the file. On your machine a build has run, so it passes; the CI `static` job never
  builds, so it fails there. Loudly, which is the point. The fix is a one-line declaration
  file of our own (`/// <reference types="next/image-types/global" />`), not committing the
  generated one back.

### Auth in e2e (F1.1)

All app routes are behind Clerk, so any scenario touching a screen needs a session:

- The Clerk **dev instance** treats `<name>+clerk_test@example.com` as a test account.
  The OTP is always `424242` and no real mail is sent. The addresses live in
  [`apps/web/e2e/clerk.ts`](../apps/web/e2e/clerk.ts).
- There are **two** accounts, and the second one is not redundancy. Since F1.6 the first
  authenticated request a user makes creates their settings row and fixes their interface
  language from `Accept-Language`, so whichever scenario signs in first decides it for every
  later one. `locale.spec.ts` therefore owns `LOCALE_TEST_EMAIL` and no other spec touches it;
  a scenario that needs a language of its own adds an account rather than sharing one.
- [`e2e/global-setup.ts`](../apps/web/e2e/global-setup.ts) issues the Clerk **Testing
  Token** (`@clerk/testing`, which bypasses bot detection for automated browsers) and creates
  those accounts through the Backend API, idempotently, so a fresh instance needs no manual
  setup.
- In a spec: call `setupClerkTestingToken({ page })`, then sign in programmatically with
  `clerk.signIn(...)` (strategy `email_code`) on a page where clerk-js is loaded, which is
  the public `/sign-in`. Example:
  [`apps/web/e2e/auth.spec.ts`](../apps/web/e2e/auth.spec.ts).

### Auth in api tests (F1.2)

The guard is global, so every api test that hits a protected route needs a token, and
none of them may reach Clerk over the network:

- [`apps/api/test/clerk-token.ts`](../apps/api/test/clerk-token.ts) generates an RSA key
  pair in the test process and signs Clerk-shaped JWTs with it.
- The spec puts the matching PEM public key in `CLERK_JWT_KEY` before booting the module.
  The guard prefers that variable, so the **real** `verifyToken()` runs, with real signature
  and expiry checks, no JWKS fetch and no dependency on a Clerk instance. Example:
  [`apps/api/test/auth.integration.spec.ts`](../apps/api/test/auth.integration.spec.ts).
- Mocking `verifyToken()` instead would leave the one thing worth proving untested; the
  key pair costs milliseconds.
- Since F1.3 a token also needs an **`azp` claim equal to the app's `WEB_ORIGIN`**, or the
  guard rejects it. Read the origin from the booted app (`resolveWebOrigin(app.get(ConfigService))`)
  rather than hardcoding it, since `WEB_ORIGIN` may be set in the environment.

### Scoped queries in api tests (F1.3)

The auto-scoping extension takes the caller from the request context, so a spec that talks to
the database has to say who is calling:

```ts
const asUser = <T>(userId: string, query: () => Promise<T>): Promise<T> =>
  context.run(async () => {
    context.setUserId(userId);
    return await query(); // the await belongs inside the scope — see below
  });
```

- **A read of a model a budget owns needs a budget in the scope too**, via
  `context.setBudgetId(...)`, or the extension refuses it. In the running app the extension
  looks the budget up itself on the first such query; a spec that builds the scoped client by
  hand passes a resolver of its own, and one that only wants a fixed budget sets it directly.
  Over HTTP nothing is needed beyond the caller having an `active` budget row. Patterns to
  copy: [`apps/api/test/budget-scoping.integration.spec.ts`](../apps/api/test/budget-scoping.integration.spec.ts)
  over HTTP, [`apps/api/test/active-budget.spec.ts`](../apps/api/test/active-budget.spec.ts)
  for the resolver.
- **A write to a guarded model needs the mutation marker**, via `context.runInMutation(...)`,
  or the extension refuses it whatever the scope says. Which models those are is
  `MUTATION_GUARDED_MODELS` in
  [`scoped-models.ts`](../apps/api/src/prisma/scoped-models.ts); a write to a model on the
  exemption list beside it needs no marker. And the write goes through `MUTATOR_PRISMA`, the client a
  mutation's transaction comes from, rather than the `SCOPED_PRISMA` a handler injects. Why the
  two are separate is in [security](../.claude/rules/security.md). A spec that asserts something about
  scoping on a write enters the marker first, so that the refusal it is testing is the one it
  means. [`apps/api/test/mutation.integration.spec.ts`](../apps/api/test/mutation.integration.spec.ts)
  drives the real service instead, which is what an endpoint will do.
- ⚠️ **Await inside the scope.** Prisma's promises are lazy: the hooks run when the promise is
  awaited, not when `findMany()` is called. Returning an un-awaited promise out of `run()`
  executes the query with no context, so a test expecting a rejection passes for the wrong
  reason. In the running app this cannot happen, because the middleware wraps the whole request.
- **Fixtures and cleanup go through the unscoped client** (`PrismaService`). Setting up user
  A's rows while acting as user B, or deleting both users' rows afterwards, is exactly what the
  scoped client is built to refuse.
- **Cross-tenant tests** are mandatory for every phase that adds domain tables. Copy
  [`apps/api/test/user-scoping.integration.spec.ts`](../apps/api/test/user-scoping.integration.spec.ts),
  which covers reads, bulk writes, ownership reassignment and behaviour inside `$transaction`.
- To exercise the **whole chain** (HTTP → guard → context → query) over a real endpoint, copy
  [`apps/api/test/user-settings.integration.spec.ts`](../apps/api/test/user-settings.integration.spec.ts)
  (F1.6). It signs a token, calls the route and checks what landed in Postgres through the
  unscoped client. Where no endpoint exposes the behaviour under test, declare a probe
  controller on the testing module instead, the way
  [`scoped-raw.integration.spec.ts`](../apps/api/test/scoped-raw.integration.spec.ts) does.

## How to add tests to a new feature

Test-first is the preferred order, and [`/tdd`](../.claude/commands/tdd.md) runs it: it derives
the scenarios from the ticket, stops for confirmation, writes them red, and only then
implements. The routing below is what it picks from, and what you pick from by hand.

1. **Domain logic** (money, budget calculations, DTOs) → a unit test next to the package
   where it lives (usually `packages/types/test/*.spec.ts`). Reach for **fast-check** when
   the claim holds over a whole space of inputs, such as an invariant or a round-trip law.
   Example: [`packages/types/test/money.spec.ts`](../packages/types/test/money.spec.ts).
   Invariant 5.5 (`RTA + Σ Available = Σ Balance`) is checked exactly this way from Phase 4.
   It is **not** the default for every spec: a named set of cases (an endpoint's rejection
   reasons, a two-branch config lookup, the casings of a header) is covered by enumerating
   them. Generating over that space proves the standard library works, and buys it with a
   dependency and a slower suite.
2. **Endpoint / DB work** → `apps/api/test/<feature>.integration.spec.ts`. Bring up
   the real `AppModule` via `@nestjs/testing` + supertest. Example:
   [`apps/api/test/health.integration.spec.ts`](../apps/api/test/health.integration.spec.ts).
   api unit tests (no DB) go in a regular `*.spec.ts` next to the code or in `test/`.
3. **Component / page** → a jsdom test in `apps/web/test` (Testing Library).
4. **User scenario** (a whole screen, web + api) → `apps/web/e2e/<feature>.spec.ts`.
   Example: [`apps/web/e2e/auth.spec.ts`](../apps/web/e2e/auth.spec.ts), which drives a real
   screen. (`home.spec.ts` is a bare API probe, not a scenario to copy.) E2E is the most
   expensive level: one or two scenarios per feature, cover the rest lower down.
5. Package has no runner yet? Copy `jest.config.mjs` from `packages/types` (node) or
   `apps/web` (jsdom), add `test` / `test:unit` scripts, and turbo picks them up automatically.
   Drop the `coverageThreshold` you copy along with it unless the new package means to hold
   that bar, and drop the `process.env.TZ` line too. It is there so the calendar specs run in
   a zone that is not UTC, which is what makes them fail against code that reads the host's
   zone; a suite that does not touch dates only inherits a surprise.

### Naming is load-bearing in `apps/api`

`apps/api` matches `\.spec\.ts$` only, so a file named `*.test.ts` there **never runs** and
says nothing about it. `apps/web` takes `*.spec.tsx?` and `*.test.tsx?`, `packages/types` and
`packages/api-client` take both `.ts` forms. Integration specs are `*.integration.spec.ts` and
the api's unit config ignores them by name. Running them through `test:unit` reports green
without executing them.

### Coverage thresholds

Two exist, and a run can exit non-zero with every test passing:

- `packages/types` is at 100% globally;
- `apps/api` is at 100% over `src/validation/`, on the **unit** config only.

That failure means a missing test, never a lowered threshold.

## Conventions

- Integration tests run **sequentially** (`--runInBand`); the DB is shared, so no races.
- Test files must be in the `include` of the corresponding `tsconfig.json`, or
  `typecheck` and type-aware lint (`no-floating-promises` in api) won't see them.
- Jest globals (`describe` / `it` / `expect`) are registered for test files in the shared
  ESLint config (`@rondo/config/eslint`); in Playwright specs, `test`/`expect` are imported.
- Turbo doesn't cache integration and e2e, because of the external state in the DB; the unit
  level is cached.
- Jest always collects coverage, so every unit/integration run writes an `lcov.info` into the
  workspace (git-ignored). The `sonar` CI job imports those files into SonarQube
  Cloud (see [ci.md](ci.md)); the lcov reporter's `projectRoot` option keeps the paths
  repo-root-relative, which the Sonar scanner requires. Copy it along when adding a jest
  config to a new package, and list the new lcov in `sonar-project.properties`.
  **A workspace with two test levels needs two directories and two entries.** `apps/api` writes
  `coverage/unit/` and `coverage/integration/`, and why that matters is in
  [ci.md](ci.md). Since the quality gate landed, this is not only a report. The Sonar quality gate
  blocks a pull request whose **new** code
  is under-covered, so a red `sonar` is answered with a test, not with a threshold.
