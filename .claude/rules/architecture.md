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
- The Prisma schema and its migrations live only in `packages/db`.

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
