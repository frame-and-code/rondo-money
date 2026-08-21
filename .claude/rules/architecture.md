# Architecture

Boundaries and invariants that outlive any single feature. The phase plan and the ADRs
live in Notion (see [specs](specs.md)); this file holds the part you must not have to look
up.

## Boundaries

- **The backend owns every database access** (ADR-002). `apps/web` never imports Prisma
  and never reaches Postgres.
- `apps/web` talks to the API through the typed client generated from the OpenAPI spec
  (`packages/api-client`, F1.4). Its single entry point is
  [`apps/web/src/lib/api/client.tsx`](../../apps/web/src/lib/api/client.tsx), an `ApiProvider`
  that supplies the base URL, the Clerk token and the TanStack Query cache, and nothing else.
  Screens read through the generated query options (`useQuery(xxxOptions())`); do not
  hand-write a request beside them, and do not add a second `fetch` path.
- DTOs have one home: `packages/types`. A type restated in `apps/web` or `apps/api` is two
  sources of truth waiting to drift. The response classes under `apps/api` (F1.4) are not an
  exception. They _are_ the OpenAPI schema, declared once, and what `apps/web` uses is
  generated from the document they produce rather than hand-copied. A shape that outlives one
  endpoint's response, such as money or a domain model, still belongs in `packages/types`, with
  the response class referencing it.
- The Prisma schema and its migrations live only in `packages/db`. The code that scopes
  queries to a caller lives only in `apps/api` (`src/prisma`, `src/raw-sql`), because it reads
  the request context.

## How a module reaches the database

The read path exists since F1.6.
[`apps/api/src/user-settings`](../../apps/api/src/user-settings) is controller → service →
`SCOPED_PRISMA` in full, and
[`.claude/skills/add-a-domain-module`](../skills/add-a-domain-module/SKILL.md) walks a new module
through it file by file. The write path, where one user operation is one database
transaction, arrives in F3.2. What follows holds for both, and is not optional:

- a handler takes the caller from `@CurrentUserId()`, never from the body, a query parameter
  or a header;
- everything that reads or writes a domain model injects `SCOPED_PRISMA`, never
  `PrismaService`. Where the unscoped client may be imported is a lint rule, listed in
  [security](security.md);
- raw SQL only through `ScopedRawRepository`, which supplies `userId` itself; a lint rule
  fails the gate anywhere else;
- a new model joins [`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts) and gets a
  cross-tenant test in the same change (see [security](security.md)).

## How an endpoint reaches the contract

The OpenAPI document is built from the code (F1.4), so an endpoint that says nothing about
itself is published with no response shape at all, and the generated client types it
`unknown` without failing anything.

- The response is a **class** carrying `@ApiProperty` on every field, named by the handler's
  `@ApiOkResponse`. A TypeScript interface leaves no metadata after compilation, which is
  exactly the silent version of this mistake.
- `@Public()` carries one decision to both readers. It opens the handler to the guard _and_
  stamps `x-public`, which is what clears the global bearer requirement in the spec. Never add
  a second decorator saying the same thing. The two would eventually disagree.
- Money crosses the wire as a string of minor units
  ([`money.ts`](../../packages/types/src/money.ts)), in both directions. Every money field, in a
  request DTO or a response class, is declared with
  [`@ApiMoneyProperty()`](../../apps/api/src/validation/money.decorator.ts), which publishes it
  as a `string` carrying `MONEY_PATTERN` _and_ refuses anything else at the pipe. The two must
  never be written separately, because with no Swagger CLI plugin here a validation decorator
  adds nothing to the spec and nothing would catch the drift. Its options type is deliberately
  narrow. `required` and `nullable` would reach `@ApiProperty` and not the validator, so they
  would publish a field the client may omit while the pipe answers 400. The conversion to
  `bigint` is explicit, at `serializeMoney` / `parseMoney` in the service, and **never** a
  global interceptor, which would leave the code and the published schema saying different
  things. No endpoint carries an amount yet, and the convention is stated in the spec's own
  description until one does.
- Every request body **declared as a DTO class** is validated by the global pipe
  ([`validation.options.ts`](../../apps/api/src/validation/validation.options.ts)):
  `class-validator` + `class-transformer`, whitelisted, and a field the DTO never declared is
  a 400 rather than a silent drop. Implicit conversion is off on purpose. It would coerce a
  JSON number into the string a money field expects, and by then the precision is already
  gone. The pipe skips a `@Body()` typed as an interface, in silence, exactly as an
  interface response publishes no schema. See [security](security.md).
- `pnpm openapi` rewrites [`apps/api/openapi.json`](../../apps/api/openapi.json) and
  `pnpm --filter @rondo/api-client codegen` the client. Both artefacts are committed, so a
  contract change is a reviewable diff; turbo runs them in order, so neither is a step anyone
  has to remember. Since F1.5 neither is a step anyone _can_ forget either. The pre-commit hook
  regenerates both and adds them to the commit, and the CI gate re-runs them and fails on any
  difference, both through [`codegen.sh`](../../codegen.sh). So do not hand-edit a generated
  file to "fix" something; change the NestJS code that produces it. The hook **refuses** the
  commit in one case: the contract changed, but the sources it was generated from are not all
  staged. That is a partial commit, not a broken hook. The generator reads the working tree
  while the commit is built from the index, so staging the result would ship a contract this
  commit's own sources do not produce. Stage those files, or set them aside with `git stash -u`.
  A plain `git stash` leaves an untracked file where it is, so the next attempt is refused
  the same way.
- The spec gives the client more than types: request functions, TanStack Query options and zod
  schemas all come out of it. So an endpoint documented sloppily produces a sloppy client. The
  spec is the product, not paperwork about it.

## Never store derived state

Balance, RTA, Assigned, Activity, Available and net worth are computed from transactions
and assignments on demand. A column caching one of them is not an optimisation. It is a
second source of truth that will disagree with the first.

## One write point

Every domain mutation goes through the single mutation service (F3.2), and what it buys is
atomicity, not a journal (ADR-006). One user operation is one database transaction, or
nothing at all. The invariant it protects is 5.5. A composite write torn in half (a
transfer leg without its pair) is the main way to break it, and PRD 6.3 requires a
transfer to be atomic regardless. So a transfer's two legs share a `transferId` and are
created, edited and deleted together.

`ScopedRawRepository` issues its statements on the top-level client, so a raw statement
written inside the mutator would land **outside** its transaction. Pass the transactional
client in instead.

The same transaction carries the idempotency key. `IdempotencyKey` (the F3.1 migration)
is unique per (user, key) and stores the mutation's result, inserted alongside it, so a
double submit hits the unique index instead of writing twice. It gets that result back,
as if it had just run.

There is no server-side change log and no soft-delete. Deletion is physical, and undo
lives in the browser as a stack of money operations, each inverted through the same API
(Phase 8). Its scope is the part that cannot be re-derived: transactions and moves between
envelopes. RTA is an envelope too, so setting an Assigned amount **is** a move and
undoes like one; a rename, an archive and a hide are not undoable at all. Nothing on the
server replays history.

## Money, dates, schema

- Money is an integer number of minor units in `bigint`, a string over the wire, and its
  digit count comes from the currency and never from a hardcoded `2`. The convention and its
  helpers belong to [`packages/types`](../../packages/types/README.md); never re-derive them.
  Two consequences the rest of the codebase has to honour: the digit count is **frozen on the
  budget row** when budgets land rather than recomputed per read, and a runtime upgrade that
  moves the currency data is a migration rather than a bump. An amount written at one scale
  and read at another is money multiplied by a hundred.
- Dates are calendar dates without time. "Today" and `YYYY-MM` bucketing are computed in
  one reference timezone (the budget's) through a single shared helper, never a
  `new Date()` scattered across call sites.
- The schema grows one migration per phase. A category is never deleted, only hidden
  (`hiddenAt`, from the F3.1 migration). That is a visibility marker, not a soft-delete. The
  row stays in every aggregate, so its past Activity keeps counting and an expense is
  never orphaned.
- Naming, set by the first table in F1.3: PascalCase models and camelCase fields in Prisma,
  snake_case tables and columns in Postgres via `@@map` / `@map`; ids are
  `String @id @default(uuid(7)) @db.Uuid`. The mapping exists for the hand-written aggregates
  of Phases 4–5: `where user_id = $1` needs no quoting, `where "userId" = $1` does.
- After a migration, run `pnpm --filter @rondo/db build`. It is the only command that does
  both `prisma generate` (the types) and `tsc` (`dist`, the runtime entry consumers load).
  Skip it and you get one of two unrelated-looking failures: models typed as `never`, or a
  missing delegate at runtime. In a `pnpm dev` session the `tsc` half is automatic and the
  generate is not. Details in [`packages/db/README.md`](../../packages/db/README.md).

## Invariant 5.5

`RTA + Σ Available = Σ Balance`, checked over **all-time** aggregates. A future-month
assignment lowers RTA immediately but shows up in no month's Available, so a per-month
reconciliation will not balance. That is expected. A test asserting per-month equality is
a wrong test, not a found bug.

## Frontend

Screens are composed from Tailwind utilities and shadcn/ui components in `packages/ui`
(theme Ocean Breeze). No hand-written CSS files, no inline `style` props, no bespoke
re-implementation of a primitive shadcn/ui ships. Missing one? Add it with
`pnpm dlx shadcn@latest add <component>` into `packages/ui`. That one stops for the user's
confirmation (`ask` in [`settings.json`](../settings.json)), because `pnpm dlx` fetches and
executes a package and nothing does that unattended here.

### How a screen gets data

The client is configured once, in `ApiProvider`
([`apps/web/src/lib/api/client.tsx`](../../apps/web/src/lib/api/client.tsx)). A page or a
component therefore never touches a token, a header or a base URL, and never writes `fetch`.

- **Client components** read through the generated query options, imported from
  `@rondo/api-client/react-query`: `useQuery(meControllerIdentifyOptions())`. **The token
  attaches itself.** Each generated request carries the `security` its operation declares in
  the spec, so what decides is `@Public()` in `apps/api`, not the call site. Setting an
  `Authorization` header by hand in a component means either the endpoint is mis-declared in
  the spec or someone is working around it; fix the declaration.
- **Server components and route handlers must never use the module-level client.**
  `@rondo/api-client` holds one client per _process_, so configuring it on the server would put
  one visitor's token into an object every concurrent request shares. That is a cross-tenant
  leak of exactly the kind ADR-005 has no database-side net for. `ApiProvider` therefore
  configures it only in the browser (`typeof window !== 'undefined'`), which leaves it
  deliberately unconfigured on the server. Nothing needs it there yet; when something does, it
  builds its own client **per request** from `await auth()` and passes it explicitly
  (`{ client }` on the generated call), in that same `src/lib/api` module. And not a bare
  `fetch` "just this once". That is how the second API path starts, which is the thing ADR-002
  exists to prevent.
- **A missing endpoint is added to `apps/api` and regenerated**, never assembled in web out of
  a URL string.
- **Mutations** (from Phase 3) invalidate through the generated query keys. Expect the
  invalidation to be wide. No derived value is stored, so one assignment moves RTA and every
  later month's Available at once. Their idempotency key belongs to the user's intent, so it is
  minted once when the form opens, not per HTTP request. Otherwise a double click writes twice.
