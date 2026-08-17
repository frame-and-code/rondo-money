# Architecture

Boundaries and invariants that outlive any single feature. The phase plan and the ADRs
live in Notion (see [specs](specs.md)); this file holds the part you must not have to look
up.

## Boundaries

- **The backend owns every database access** (ADR-002). `apps/web` never imports Prisma
  and never reaches Postgres.
- `apps/web` talks to the API through the typed client generated from the OpenAPI spec
  (`packages/api-client`, F1.5). Until it exists, the placeholder is
  [`apps/web/src/lib/api/client.ts`](../../apps/web/src/lib/api/client.ts) — do not grow
  it into a hand-written API layer, and do not add a second `fetch` path beside it.
- DTOs have one home: `packages/types`. A type restated in `apps/web` or `apps/api` is two
  sources of truth waiting to drift.
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
