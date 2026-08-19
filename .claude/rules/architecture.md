# Architecture

Boundaries and invariants that outlive any single feature. The phase plan and the ADRs
live in Notion (see [specs](specs.md)); this file holds the part you must not have to look
up.

## Boundaries

- **The backend owns every database access** (ADR-002). `apps/web` never imports Prisma
  and never reaches Postgres.
- `apps/web` talks to the API through the typed client generated from the OpenAPI spec
  (`packages/api-client`, F1.4). Its single entry point is
  [`apps/web/src/lib/api/client.tsx`](../../apps/web/src/lib/api/client.tsx) — an `ApiProvider`
  that supplies the base URL, the Clerk token and the TanStack Query cache, and nothing else.
  Screens read through the generated query options (`useQuery(xxxOptions())`); do not
  hand-write a request beside them, and do not add a second `fetch` path.
- DTOs have one home: `packages/types`. A type restated in `apps/web` or `apps/api` is two
  sources of truth waiting to drift. The response classes under `apps/api` (F1.4) are not an
  exception: they _are_ the OpenAPI schema, declared once, and what `apps/web` uses is
  generated from the document they produce rather than hand-copied. A shape that outlives one
  endpoint's response — money, domain models — still belongs in `packages/types`, with the
  response class referencing it.
- The Prisma schema and its migrations live only in `packages/db`. The code that scopes
  queries to a caller lives only in `apps/api` (`src/prisma`, `src/raw-sql`), because it reads
  the request context.

## How a module reaches the database

The full controller → service → mutation-point pattern is established where it will first
exist: the read path in F1.6 (with the `user-settings` module) and the write path in F2.2. Only
what is already true is written here, and it is not optional:

- a handler takes the caller from `@CurrentUserId()`, never from the body, a query parameter
  or a header;
- everything that reads or writes a domain model injects `SCOPED_PRISMA`, never
  `PrismaService` — the latter is the unscoped client and belongs to `src/raw-sql` and test
  fixtures alone;
- raw SQL only through `ScopedRawRepository`, which supplies `userId` itself; a lint rule
  fails the gate anywhere else;
- a new model joins [`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts) and gets a
  cross-tenant test in the same change (see [security](security.md)).

## How an endpoint reaches the contract

The OpenAPI document is built from the code (F1.4), so an endpoint that says nothing about
itself is published with no response shape at all — and the generated client types it
`unknown` without failing anything.

- The response is a **class** carrying `@ApiProperty` on every field, named by the handler's
  `@ApiOkResponse`. A TypeScript interface leaves no metadata after compilation, which is
  exactly the silent version of this mistake.
- `@Public()` carries one decision to both readers: it opens the handler to the guard _and_
  stamps `x-public`, which is what clears the global bearer requirement in the spec. Never add
  a second decorator saying the same thing — the two would eventually disagree.
- Money crosses the wire as a string of minor units
  ([`money.ts`](../../packages/types/src/money.ts)); no endpoint carries an amount yet, and the
  convention is stated in the spec's own description until one does.
- `pnpm openapi` rewrites [`apps/api/openapi.json`](../../apps/api/openapi.json) and
  `pnpm --filter @rondo/api-client codegen` the client. Both artefacts are committed, so a
  contract change is a reviewable diff; turbo runs them in order, so neither is a step anyone
  has to remember. Since F1.5 neither is a step anyone _can_ forget either: the pre-commit hook
  regenerates both and adds them to the commit, and the CI gate re-runs them and fails on any
  difference — both through [`codegen.sh`](../../codegen.sh). So do not hand-edit a generated
  file to "fix" something; change the NestJS code that produces it. The hook **refuses** the
  commit in one case: the contract changed, but the sources it was generated from are not all
  staged. That is a partial commit, not a broken hook — the generator reads the working tree
  while the commit is built from the index, so staging the result would ship a contract this
  commit's own sources do not produce. Stage those files, or set them aside with `git stash -u`
  — a plain `git stash` leaves an untracked file where it is, so the next attempt is refused
  the same way.
- What the client gets from that spec is not only types: request functions, TanStack Query
  options and zod schemas all come out of it. So an endpoint documented sloppily produces a
  sloppy client — the spec is the product, not paperwork about it.

## Never store derived state

Balance, RTA, Assigned, Activity, Available and net worth are computed from transactions
and assignments on demand. A column caching one of them is not an optimisation — it is a
second source of truth that will disagree with the first.

## One write point

Every domain mutation goes through the single mutation service (F2.2): the state change
and its `ChangeLog` entry are written atomically in one transaction, or not at all
(ADR-001). A transfer's two legs share a `transferId` and are created, edited, deleted and
undone together. undo/redo are themselves logged mutations — redo moves a cursor, it never
rewrites history.

## Money, dates, schema

- Money is an integer number of minor units in `bigint`
  ([`packages/types/src/money.ts`](../../packages/types/src/money.ts)). The number of minor
  digits comes from the budget's currency (ISO 4217 exponent), never a hardcoded `2`. Over
  the wire money is a **string** — JSON has no bigint — via `serializeMoney` /
  `parseMoney` at the edge.
- Dates are calendar dates without time. "Today" and `YYYY-MM` bucketing are computed in
  one reference timezone (the budget's) through a single shared helper, never a
  `new Date()` scattered across call sites.
- The schema grows one migration per phase. Deleting a category must keep its past
  Activity counted in the aggregates — an expense is never orphaned.
- Naming, set by the first table in F1.3: PascalCase models and camelCase fields in Prisma,
  snake_case tables and columns in Postgres via `@@map` / `@map`; ids are
  `String @id @default(uuid(7)) @db.Uuid`. The mapping exists for the hand-written aggregates
  of Phases 4–5 — `where user_id = $1` needs no quoting, `where "userId" = $1` does.
- After a migration, run `pnpm --filter @rondo/db build` — it is the only command that does
  both `prisma generate` (the types) and `tsc` (`dist`, the runtime entry consumers load).
  Skip it and you get one of two unrelated-looking failures: models typed as `never`, or a
  missing delegate at runtime. Details in
  [`packages/db/README.md`](../../packages/db/README.md).

## Invariant 5.5

`RTA + Σ Available = Σ Balance`, checked over **all-time** aggregates. A future-month
assignment lowers RTA immediately but shows up in no month's Available, so a per-month
reconciliation will not balance. That is expected: a test asserting per-month equality is
a wrong test, not a found bug.

## Frontend

Screens are composed from Tailwind utilities and shadcn/ui components in `packages/ui`
(theme Ocean Breeze). No hand-written CSS files, no inline `style` props, no bespoke
re-implementation of a primitive shadcn/ui ships. Missing one? Add it with
`pnpm dlx shadcn@latest add <component>` into `packages/ui`.

### How a screen gets data

The client is configured once, in `ApiProvider`
([`apps/web/src/lib/api/client.tsx`](../../apps/web/src/lib/api/client.tsx)). A page or a
component therefore never touches a token, a header or a base URL, and never writes `fetch`.

- **Client components** read through the generated query options, imported from
  `@rondo/api-client/react-query`: `useQuery(meControllerIdentifyOptions())`. **The token attaches itself** — each generated
  request carries the `security` its operation declares in the spec, so what decides is
  `@Public()` in `apps/api`, not the call site. Setting an `Authorization` header by hand in a
  component means either the endpoint is mis-declared in the spec or someone is working around
  it; fix the declaration.
- **Server components and route handlers must never use the module-level client.**
  `@rondo/api-client` holds one client per _process_, so configuring it on the server would put
  one visitor's token into an object every concurrent request shares — a cross-tenant leak of
  exactly the kind ADR-005 has no database-side net for. `ApiProvider` therefore configures it
  only in the browser (`typeof window !== 'undefined'`), which leaves it deliberately
  unconfigured on the server. Nothing needs it there yet; when something does, it builds its own
  client **per request** from `await auth()` and passes it explicitly (`{ client }` on the
  generated call), in that same `src/lib/api` module. And not a bare `fetch` "just this once" —
  that is how the second API path starts, which is the thing ADR-002 exists to prevent.
- **A missing endpoint is added to `apps/api` and regenerated**, never assembled in web out of
  a URL string.
- **Mutations** (from Phase 3) invalidate through the generated query keys. Expect the
  invalidation to be wide: no derived value is stored, so one assignment moves RTA and every
  later month's Available at once.
