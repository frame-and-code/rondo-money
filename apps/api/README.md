# @rondo/api

Rondo Money backend on **NestJS (REST)** — skeleton F0.4, closed to anonymous callers since
F1.2, scoping every query for domain data to the caller since F1.3. The one deliberate
exception is the healthcheck's `SELECT 1`, which touches no tenant data and is named as such
below.

There are still no endpoints that touch a table: the first one arrives in F1.6 and the single
mutation point in F2.2. What exists already is the machinery they are built on — the request
context, the auto-scoped Prisma client and the raw-SQL repository below — plus the contract
those endpoints will be published through (F1.4).

## Endpoints

- `GET /health` — checks the DB connection (`SELECT 1` via Prisma). `200` if the DB
  is reachable, `503` if not. Public (see below).
- `GET /me` — echoes back the `userId` the guard verified. Protected, and touches no table:
  it exists so the whole auth chain (token → guard → `@CurrentUserId()`) can be exercised
  over HTTP, by tests and by the web client, before any domain data exists (F1.4).

`PrismaService` connects to Postgres via the `@prisma/adapter-pg` driver adapter
(Prisma 7, Rust-free client); `DATABASE_URL` comes from `ConfigService`.

## The contract (F1.4)

The API describes itself, and everything downstream is generated from that description
(ADR-002) — nothing is hand-written twice.

```bash
pnpm openapi                              # → apps/api/openapi.json (builds the api first)
pnpm --filter @rondo/api-client codegen   # → packages/api-client/src/generated
```

Both are printed here to say what the chain _is_ — running them by hand is not part of the
workflow (F1.5). The pre-commit hook runs them and stages the result — or refuses the commit,
when the contract moved and the sources behind it are not all staged — and the CI gate re-runs
them and fails if that changes anything; `codegen.sh` at the repository root is the one
definition both callers share.

- **Generation needs neither a server nor a database.** The script boots the compiled app in
  Nest's _preview_ mode ([`src/openapi/generate.ts`](src/openapi/generate.ts)), which wires the
  module graph and the controller prototypes — all the Swagger scanner reads — without
  constructing a single provider. So `PrismaService` never runs, `DATABASE_URL` is never
  demanded, and the CI step that regenerates the contract needs no connection string. Dropping
  preview mode quietly reintroduces all three; `test/openapi.spec.ts` lives in the **unit**
  suite for that reason.
- **How a handler gets into the spec** — a response class with `@ApiProperty`, named in
  `@ApiOkResponse`; see [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).
  An interface produces an endpoint with no documented shape at all.
- **`@Public()` also opens the endpoint in the spec.** It stamps the `x-public` extension, and
  [`buildOpenApiDocument`](src/openapi/document.ts) clears the document-wide bearer requirement
  wherever it finds one. There is no decorator that can express "no security" directly:
  `@ApiSecurity` only appends, and an empty requirement is dropped by the scanner before it
  reaches the document.
- **Swagger UI is served everywhere except production**, at `/docs`. Swagger mounts it through
  the HTTP adapter rather than as a controller, so the global guard never sees those routes —
  wherever it is on, it is on for everyone. The spec itself is not a secret (the repository is
  public, ADR-003); what production withholds is an anonymous "Try it out" console pointed at
  real data.

| Variable   | Meaning                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV` | `development` (the default when unset), `test` or `production`. Only these three; anything else refuses to boot rather than guess. It decides whether `/docs` is served — and **the Docker image sets `production` itself**, so a deployment that wants the docs sets the variable explicitly (see [deploy-railway.md](../../docs/deploy-railway.md)). |

## Authentication (F1.2)

Every request carries a Clerk session token as `Authorization: Bearer <jwt>`.
[`ClerkAuthGuard`](src/auth/auth.guard.ts) verifies its signature with
[`verifyToken()`](https://clerk.com/docs/guides/sessions/manual-jwt-verification) and puts
the `sub` claim on the request as `userId`; anything missing, malformed, expired or signed
by someone else is `401`, with no hint in the body about which of those it was.

- The guard is registered **globally** ([`AuthModule`](src/auth/auth.module.ts) →
  `APP_GUARD`), so a new endpoint is protected without anyone remembering to protect it.
  Opening one is an explicit [`@Public()`](src/auth/public.decorator.ts) on the handler or
  the controller — that is how `GET /health` stays reachable for Railway's anonymous probe.
- Handlers read the caller with [`@CurrentUserId()`](src/auth/current-user.decorator.ts).
  **This is the only source of identity**: a `userId` taken from the body, the query or a
  header is a request to read someone else's money, and with no RLS behind us (ADR-005)
  nothing further down would catch it.
- The token must also have been minted **for this app**: `verifyToken()` is configured with
  `authorizedParties`, so the `azp` claim has to equal `WEB_ORIGIN` (F1.3, closing a
  carry-over from F1.2). This is Clerk's standard defence against a token leaked to another
  subdomain being replayed here. If a real browser token ever answers 401, that is the check
  talking — the guard's debug log names the claim and the value it expected; fix `WEB_ORIGIN`
  rather than dropping the check.

### Configuration

| Variable           | Meaning                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `CLERK_JWT_KEY`    | the instance's PEM public key — signatures are checked locally, no call to Clerk. Wins over the other.   |
| `CLERK_SECRET_KEY` | accepted fallback: resolves the JWKS from Clerk (cached five minutes). Nothing here uses it — see below. |

One of the two is **required**: with neither, the process exits at startup (`main.ts`)
instead of answering 401 to every caller. **Every environment uses `CLERK_JWT_KEY`** —
locally from `apps/api/.env.local` ([`.env.local.tpl`](.env.local.tpl) via `pnpm
env:setup`), in CI from a repository secret, on Railway from the service's variables. The
api holds no Clerk secret at all: it only ever verifies signatures, and the public key is
enough for that.

⚠️ **Do not switch a deployed api to `CLERK_SECRET_KEY`.** On that path a token whose `kid`
is not already cached costs one outbound request to Clerk, and a miss is never cached — so
forged tokens carrying random `kid`s amplify one-for-one into JWKS fetches until the Clerk
instance is rate-limited and genuine users get 401s. The api logs a warning at startup
whenever it is running that way; keeping every environment on the PEM key is what keeps
that warning worth reading.

## Tenant isolation (F1.3)

There is no row-level security in Postgres (ADR-005), so everything RLS would have guaranteed
is ordinary code here — and code fails silently. Four mechanisms carry it, in order:

1. **The request context** — [`RequestContextService`](src/request-context/request-context.service.ts)
   holds the caller's `userId` in an `AsyncLocalStorage` for the life of one request. A
   middleware opens the scope before any guard runs; the guard fills it from the verified
   token. Nothing reads the identity from a parameter, so no call site can forget to pass it.
   Later phases add fields to the same store: the active `budgetId` (F3.1) and the
   inside-the-mutator marker (F2.2).
2. **The auto-scoped client** — inject `SCOPED_PRISMA`
   ([`scoped-prisma.ts`](src/prisma/scoped-prisma.ts)), not `PrismaService`. Reads of a
   registered model are filtered by the caller, writes are stamped with them, and an operation
   the extension has no rule for (`groupBy`, `aggregate`) is **refused** rather than run
   unfiltered — see [`user-scoping.extension.ts`](src/prisma/user-scoping.extension.ts).
   `PrismaService` itself is the unscoped client underneath: legitimate only for the raw-SQL
   repository and test fixtures, and the lint rule `@rondo/config/eslint/unscoped-prisma` fails
   the gate if a domain module imports it anyway.
   - Note on types: Prisma still requires `userId` in a write payload, so a caller names an
     owner — the extension overwrites it with the verified caller, which is what makes naming
     the wrong one harmless. On a read a caller passes no `userId` at all; `SCOPED_PRISMA`
     adds the filter. That is a property of _this_ client, not permission to use another one.
   - It sees **top-level operations only.** A write that nests a relation (a `create` inside
     another model's `data`) keeps whatever `userId` the caller put on the nested rows.
     Unreachable today (one model, no relations), but that is the shape a transfer's two legs
     are written in, so F2.2 either scopes them explicitly or creates them as separate
     top-level writes inside its transaction.
3. **The registry** — [`scoped-models.ts`](src/prisma/scoped-models.ts) lists the models this
   applies to, and a new table joins it in the same change that creates it. Forgetting is
   caught by [`test/scoped-models.spec.ts`](test/scoped-models.spec.ts), which walks the schema
   and fails when a model with a `userId` column is missing (the CI gate), and flagged earlier
   by `.claude/hooks/stop-scoping-drift.sh` (a reminder, in Claude Code sessions only).
4. **Raw SQL in one place** — the extension covers the model API only; `$queryRaw` /
   `$executeRaw` bypass it entirely. They live in [`src/raw-sql`](src/raw-sql):
   [`ScopedRawRepository`](src/raw-sql/scoped-raw.repository.ts) hands the statement builder a
   scope taken from the request context (no context → it throws before any SQL is sent), and
   [`DatabaseProbe`](src/raw-sql/database-probe.ts) holds the one deliberately unscoped query,
   the healthcheck's `SELECT 1`. Everywhere else the lint rule
   (`@rondo/config/eslint/prisma-raw`) fails the gate — there are no inline exemptions.

What none of this can prove is that a raw statement actually _uses_ the scope it was given;
that is what the cross-tenant tests are for, on every phase that adds an aggregate.

## Running

```bash
pnpm --filter @rondo/api dev     # nest start --watch (recompilation via SWC)
pnpm --filter @rondo/api build   # nest build → dist/
pnpm --filter @rondo/api start   # node dist/main.js
pnpm --filter @rondo/api test    # jest: unit, then integration (needs the local Postgres)
pnpm openapi                     # regenerate openapi.json via turbo (builds first; no DB)
```

`DATABASE_URL` comes from the root `.env` (see `.env.example`) and the Clerk key from
`apps/api/.env.local`; on Railway both come from real environment variables, which take
precedence over any file. Port — `PORT` (defaults to `3000`).

`WEB_ORIGIN` names the browser client and now carries two exact-match jobs: CORS is scoped to
it, and a session token is accepted only if its `azp` claim equals it. Consequences worth
knowing before a deploy:

- **the api refuses to start without it** (`assertWebOriginConfigured`, called from `main.ts`),
  because the alternative is a service that passes its anonymous healthcheck and 401s every
  real caller;
- a _wrong_ value — a trailing slash, `http` for `https` — cannot be caught that way, and shows
  up as 401 everywhere with no CORS error to point at it;
- the `http://localhost:3001` fallback exists for specs, which build the app through
  `Test.createTestingModule` and never pass through `main.ts`.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@rondo/config/tsconfig/base.json` we add `experimentalDecorators`
  / `emitDecoratorMetadata` and `module: nodenext` (resolves as CommonJS — the package has no
  `"type": "module"`). The actual build is done by SWC (`.swcrc`); `tsc` is typecheck only.
- **`@/` alias at runtime:** SWC rewrites `@/*` into relative paths at build time
  (`jsc.baseUrl` + `jsc.paths`); in tests — via Jest's `moduleNameMapper`.
- **Type-aware ESLint:** `@rondo/config/eslint/type-checked` is enabled with
  `no-floating-promises` / `no-misused-promises` — critical for atomic mutations.
