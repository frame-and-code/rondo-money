---
paths:
  - 'apps/api/**'
  - 'packages/db/**'
  - 'packages/types/**'
---

# The API and the database

How a request reaches a row and how an endpoint reaches the contract. Loaded only while
work touches `apps/api`, `packages/db` or `packages/types`; the invariants it serves are in
[architecture](architecture.md) and [security](security.md).

## Reaching the database

[`apps/api/src/user-settings`](../../apps/api/src/user-settings) holds the read path whole,
controller, service, `SCOPED_PRISMA`; [`apps/api/src/mutations`](../../apps/api/src/mutations)
is the write path. [`add-a-domain-module`](../skills/add-a-domain-module/SKILL.md) and
[`add-a-mutation`](../skills/add-a-mutation/SKILL.md) walk each one file by file.

- A handler takes the caller from `@CurrentUserId()`, never from the body, a query parameter
  or a header. The guard puts `userId` into the request context
  ([`RequestContextService`](../../apps/api/src/request-context/request-context.service.ts));
  asking for a caller that is not there throws.
- Domain code injects `SCOPED_PRISMA`
  ([`scoped-prisma.ts`](../../apps/api/src/prisma/scoped-prisma.ts)), never `PrismaService`.
  Reads of a registered model are filtered by `userId`; writes are stamped on both the
  `where` and the `data`, so a payload naming another owner is harmless. An operation with no
  scoping rule of its own (`groupBy`, `aggregate`) runs only when its `where` names the
  caller, and the active budget too on a model a budget owns; otherwise it throws.
- A model a budget owns is filtered by `budgetId` as well. The active budget is the caller's
  one `active` row, resolved on the first query that needs it, on the transaction in flight
  when there is one, and remembered for the request. An operation issued when the caller has
  none is refused rather than reaching every budget the caller owns. The filter covers
  reads and the writes that pick out existing rows (`update`, `updateMany`,
  `updateManyAndReturn`, `delete`, `deleteMany`, the `where` half of an `upsert`). The writes
  that create rows take their budget from the payload and must: the request that creates a
  budget carries an id that did not exist when it started. The extension never stamps a
  budget onto a payload, and asking the context for the budget returns nothing instead of
  throwing.
- Prisma's unchecked write input still asks for `userId`, and the extension overwrites it. Its
  checked input drops the field on a model whose budget relation carries `userId`, so a payload
  naming parents with `connect` matches neither form and Prisma refuses it at runtime. Pass the
  ids flat.
- The extension covers top-level operations only. A nested write keeps whatever `userId` the
  caller put on the nested rows, so a relation written that way is split into separate
  top-level writes inside the transaction. The composite foreign keys refuse a child naming a
  parent from another budget or owner ([`packages/db`](../../packages/db/README.md)), so the
  failure is a refused write rather than a leak, but the payload is the caller's to get right.
- The extension does not check that a `budgetId`, `accountId` or `categoryId` in a payload
  belongs to the caller; the composite foreign keys do.
- Raw SQL only through `ScopedRawRepository` ([`src/raw-sql`](../../apps/api/src/raw-sql)),
  which supplies `userId` and nothing else; the statement adds the budget itself and is built
  beside the module it serves, as a function returning `Prisma.Sql`
  ([`aggregate-query`](../skills/aggregate-query/SKILL.md)). `execute` is the raw write path: it
  refuses outside a mutation and takes that mutation's client as a required argument. `query`
  reads, and inside a mutation it refuses the pooled client the same way. `DatabaseProbe`
  holds the one deliberately unscoped statement, the healthcheck. A write spelled as a
  `$queryRaw` is caught by nothing but review.
- A new model joins [`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts) in the
  same change, both registries where it belongs to a budget, and gets a cross-tenant test
  (pattern: [`user-scoping.integration.spec.ts`](../../apps/api/test/user-scoping.integration.spec.ts)).
  `apps/api/test/scoped-models.spec.ts` fails the gate on a model carrying `userId` or
  `budgetId` that is missing from its registry.

Where each client and the raw API may be imported is lint, composed into
`@rondo/config/eslint/tenant-isolation`: `unscoped-prisma` (`PrismaService` only in
`src/prisma`, `src/raw-sql` and tests), `mutator-prisma` (`MUTATOR_PRISMA` only in
`src/prisma`, `src/mutations` and tests), `prisma-raw` (no `$queryRaw` / `$executeRaw` outside
`src/raw-sql`) and `assignment-writes` (the `Assignment` model is written only in
`src/moves`). There are no inline exemptions. Every restriction on one ESLint rule reaches a
file in a single object, because flat config replaces a rule's options rather than merging
them.

## The single write point

A write to a model in `MUTATION_GUARDED_MODELS` happens inside
[`MutationService.run`](../../apps/api/src/mutations/mutation.service.ts), and the scoping
extension throws on one that is not. Every model is either in that registry or in the
exemption list beside it: a user's settings, whose row their own first read creates, and the
idempotency key, which the service writes on its own transaction. Exempt means the mutator
does not force itself on the model; the settings row is created by a read and
changed inside a mutation like anything else.

- Inside a mutation, the client the mutation hands out is the only one that may be used.
  `SCOPED_PRISMA` refuses any operation on a scoped model while a mutation is open, by
  operation rather than by a list of writes, because issued on the pooled connection a write
  would survive the rollback and a read would answer from before the transaction.
  `MUTATOR_PRISMA` is the same scoping without that refusal, and `MutationService` opens its
  transaction from it. A spec that exercises scoping on a write holds the lower client for the
  same reason.
- A mutation opened inside another one is refused. Compose the whole operation in a single
  `run`.
- `IdempotencyKey` is unique per (user, key). The row is claimed first, so a concurrent
  duplicate waits on the index; the result is written onto it before the commit; a repeat is
  answered with the stored result on a separate query after the conflict rolled the
  transaction back. The row carries a fingerprint of the request, so a different intent
  wearing the first one's key is refused rather than answered with
  a result that describes a write it never made.
- Erasing everything a caller owns is one statement per table rather than a domain write. It
  runs inside the mutation, names no model through Prisma, deletes the rows of every budget the
  caller has, and spares the idempotency key the running request claimed.

## Reaching the contract

The OpenAPI document is built from the code. An endpoint that says nothing about itself is
published with no response shape, and the client types it `unknown` without failing anything.

- The response is a class carrying `@ApiProperty` on every field, named by the success
  decorator the handler carries (`@ApiOkResponse` for a read, `@ApiCreatedResponse` for a
  create). An interface leaves no metadata after compilation. A handler taking an idempotency
  key names [`ConflictResponse`](../../apps/api/src/mutations/conflict.response.ts) on
  `@ApiConflictResponse`; one that can answer 400, which every handler with a DTO body can,
  names [`BadRequestResponse`](../../apps/api/src/openapi/bad-request.response.ts) on
  `@ApiBadRequestResponse`. An undocumented status collapses the operation's error type to
  `unknown`.
- `@Public()` opens the handler to the guard and stamps `x-public`, which clears the bearer
  requirement in the spec. Never add a second decorator saying the same thing.
- A money field, in a request DTO or a response class alike, is `@ApiMoneyProperty()`. More
  generally, a value the pipe must refuse and the spec must describe gets one decorator that
  does both, because there is no Swagger CLI plugin here and a validation decorator alone adds
  nothing to the spec: [`@ApiMoneyProperty()`](../../apps/api/src/validation/money.decorator.ts),
  [`@ApiCurrencyProperty()`](../../apps/api/src/validation/currency.decorator.ts),
  [`@ApiTimeZoneProperty()`](../../apps/api/src/validation/timezone.decorator.ts),
  [`@ApiCalendarMonthProperty()`](../../apps/api/src/validation/month.decorator.ts). Money's
  options are `required`, which moves the spec and the pipe together, and `sign`
  (`nonNegative` or `positive`); `nullable` is not an option because it would reach the spec
  alone. A currency publishes the shape of a code, never the list, so a runtime upgrade cannot
  rewrite the committed contract. A query parameter is a DTO class like any other.
- A `PATCH` that takes the whole record clears an optional field by leaving it out. An
  explicit `null` is a 400.
  [`write-net-worth-item.dto.ts`](../../apps/api/src/net-worth/write-net-worth-item.dto.ts) is
  one DTO serving both the write and the change.
- Every body declared as a DTO class is validated by the global pipe
  ([`validation.options.ts`](../../apps/api/src/validation/validation.options.ts)):
  whitelisted, undeclared fields are a 400, implicit conversion off. A `@Body()` typed as an
  interface is skipped in silence, so the DTO is a class, always. A nested object carries
  `@ValidateNested()` and `@Type(() => That)`, or its undeclared fields reach the handler;
  `test/openapi.spec.ts` fails the gate on one left open. Anything walking those schemas reads
  through `allOf`, because the generator wraps a described `$ref` in one.
- Money crosses the wire as a string of minor units, converted at `serializeMoney` /
  `parseMoney` in the service and never in a global interceptor.
- `pnpm openapi` rewrites [`apps/api/openapi.json`](../../apps/api/openapi.json) and
  `pnpm --filter @rondo/api-client codegen` the client. Both are committed, the pre-commit
  hook regenerates and stages them, and CI fails on a difference, all through
  [`codegen.sh`](../../codegen.sh). Never hand-edit a generated file. The hook refuses a commit
  whose contract changed while the sources it came from are not all staged; stage them or set
  them aside with `git stash -u`.

## Money, dates, schema

- The digit count of a currency is frozen on the budget row, never recomputed per read, and a
  runtime upgrade that moves the currency data is a migration. An amount written at one scale
  and read at another is money multiplied by a hundred.
- "Today" and `YYYY-MM` bucketing use the budget's `timezone` column through
  [`calendar.ts`](../../packages/types/src/calendar.ts), never a `new Date()` at a call site.
- One migration per phase. A category is hidden (`hiddenAt`), never deleted by anything a
  budget does; the row stays in every aggregate. The one thing that deletes it is the caller
  erasing everything they own.
- PascalCase models and camelCase fields in Prisma, snake_case tables and columns via `@@map`
  / `@map`; ids are `String @id @default(uuid(7)) @db.Uuid`. The mapping exists for the
  hand-written aggregates: `where user_id = $1` needs no quoting.
- After a migration, run `pnpm --filter @rondo/db build`. It is the only command that does both
  `prisma generate` and `tsc`; skip it and models type as `never` or a delegate is missing at
  runtime ([`packages/db/README.md`](../../packages/db/README.md)).
