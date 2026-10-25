# Architecture

The invariants that outlive any feature. How each is implemented is in [api](api.md) and
[web](web.md), which load with the workspace they describe; the ADRs are in Notion
([specs](specs.md)).

## Boundaries

- The backend owns every database access (ADR-002). `apps/web` never imports Prisma and never
  reaches Postgres.
- `apps/web` talks to the API only through the generated client (`packages/api-client`), with
  one entry point, [`client.tsx`](../../apps/web/src/lib/api/client.tsx). No hand-written
  request beside it and no second `fetch` path. A missing endpoint is added to `apps/api` and
  regenerated.
- DTOs have one home, `packages/types`. The response classes in `apps/api` are the OpenAPI
  schema itself; a shape that outlives one response (money, a domain model) still belongs in
  `packages/types`.
- The Prisma schema and its migrations live only in `packages/db`. The code that scopes
  queries to a caller lives only in `apps/api`.
- The OpenAPI document and the client are generated from the code and committed. Never
  hand-edit either; change the NestJS code that produces them.

## Never store derived state

Balance, ready to assign, Assigned, Activity, Available and net worth are computed on demand.
A column caching one is a second source of truth. An asset's amount is not derived: the user
entered it.

## One write point

Every domain mutation goes through
[`MutationService`](../../apps/api/src/mutations/mutation.service.ts), for atomicity rather than
a journal (ADR-006). One user operation is one transaction or nothing: a transfer's two legs
share a `transferId` and are created, edited and deleted together. The same transaction carries
the idempotency key. `Assignment` has exactly one writer, [`src/moves`](../../apps/api/src/moves),
because assigning money is a move out of the pool and the undo stack needs one inverse.

There is no server-side change log and no soft-delete. Deletion is physical, and undo is a
stack in the browser inverting transactions and moves through the same API. A rename, an
archive and a hide are not undoable. Hiding a category (`hiddenAt`) is a visibility marker, not
a soft-delete: the row stays in every aggregate.

## Money and dates

Money is an integer number of minor units in `bigint`, a string over the wire, with the digit
count taken from the currency and never a hardcoded `2`
([`packages/types`](../../packages/types/README.md)). Dates are calendar dates without time,
bucketed in the budget's timezone through
[`calendar.ts`](../../packages/types/src/calendar.ts).

## Invariant 5.5

`RTA + Σ Available = Σ Balance`, checked over all-time aggregates. A future-month assignment
lowers RTA now and shows in no month's Available, so a per-month reconciliation will not
balance, and a test asserting it is a wrong test.
