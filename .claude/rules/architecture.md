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

[`apps/api/src/user-settings`](../../apps/api/src/user-settings) is the read path in full,
controller → service → `SCOPED_PRISMA`, and
[`add-a-domain-module`](../skills/add-a-domain-module/SKILL.md) walks a new module through it
file by file. The write path is [`apps/api/src/mutations`](../../apps/api/src/mutations), and
[`add-a-mutation`](../skills/add-a-mutation/SKILL.md) walks that one. What follows holds for
both, and is not optional:

- a handler takes the caller from `@CurrentUserId()`, never from the body, a query parameter
  or a header;
- outside a mutation, everything that reads or writes a domain model injects `SCOPED_PRISMA`,
  never `PrismaService`. Inside one, the work uses the client the mutation handed it and
  nothing else, which is a refusal rather than a convention. Where each client may be imported
  is a lint rule, listed in [security](security.md);
- a write to a **guarded** model happens inside `MutationService.run`, and the scoping
  extension **throws** on one that is not, so the single write point is a mechanism rather than
  a convention. Which models are guarded is `MUTATION_GUARDED_MODELS` in
  [`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts), and the exemption list
  beside it holds the two that are not: a user's settings, which their own first read creates,
  and the idempotency key, which the mutation service writes on its own transaction;
- raw SQL only through `ScopedRawRepository`, which supplies `userId` itself; a lint rule
  fails the gate anywhere else;
- a new model joins [`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts), both
  registries where it belongs to a budget, and gets a cross-tenant test in the same change
  (see [security](security.md)).

## How an endpoint reaches the contract

The OpenAPI document is built from the code (F1.4), so an endpoint that says nothing about
itself is published with no response shape at all, and the generated client types it
`unknown` without failing anything.

- The response is a **class** carrying `@ApiProperty` on every field, named by whichever
  success decorator the handler carries: `@ApiOkResponse` for a read, `@ApiCreatedResponse`
  for a create. A TypeScript interface leaves no metadata after compilation, which is exactly
  the silent version of this mistake. A handler that takes an idempotency key also names
  [`ConflictResponse`](../../apps/api/src/mutations/conflict.response.ts) on
  `@ApiConflictResponse`, because every one of them can answer with it, and an undocumented
  status collapses the whole error type of that operation to `unknown` in the client. A
  handler that can answer 400 names
  [`BadRequestResponse`](../../apps/api/src/openapi/bad-request.response.ts) on
  `@ApiBadRequestResponse` for the same reason, and one taking a DTO body always can, whatever
  the handler itself does, because the pipe answers before it. That one class covers both raisers, which is why it lives with the document
  rather than beside either of them.
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
  things. The bound an amount lives under is one option, `sign`, reading `nonNegative` for one
  that may not go below zero and `positive` for one that would do nothing at zero, and that one
  word moves the published pattern and the pipe's together; stating the bound in only one of
  them would promise a field the other refuses, and a flag per bound would let a field ask for
  two and get whichever was tested first.
- **A value the app must recognise, and not merely parse, gets one decorator that does both.**
  A currency is [`@ApiCurrencyProperty()`](../../apps/api/src/validation/currency.decorator.ts),
  a zone is [`@ApiTimeZoneProperty()`](../../apps/api/src/validation/timezone.decorator.ts) and
  a month is [`@ApiCalendarMonthProperty()`](../../apps/api/src/validation/month.decorator.ts),
  each publishing the field and refusing an unusable value together, for the reason money's
  does. A query parameter is a DTO class like any other, so it gets the same treatment. What a currency publishes is the shape of a code and never the list of them: the codes
  come from the runtime's own data, so an enum in the schema would let a runtime upgrade
  rewrite the committed contract and fail the gate on a change that touches no currency.
  [`create-budget.dto.ts`](../../apps/api/src/budgets/create-budget.dto.ts) is a request DTO
  using both.
- Every request body **declared as a DTO class** is validated by the global pipe
  ([`validation.options.ts`](../../apps/api/src/validation/validation.options.ts)):
  `class-validator` + `class-transformer`, whitelisted, and a field the DTO never declared is
  a 400 rather than a silent drop. Implicit conversion is off on purpose. It would coerce a
  JSON number into the string a money field expects, and by then the precision is already
  gone. The pipe skips a `@Body()` typed as an interface, in silence, exactly as an
  interface response publishes no schema. See [security](security.md). It also skips **inside**
  a nested object it was not told to validate, so a field declared as a class of its own carries
  `@ValidateNested()` and `@Type(() => That)`. Without the pair, an undeclared field one level
  down reaches the handler while the top level refuses its own, and the published schema says
  the nested object takes anything. `test/openapi.spec.ts` walks the request schemas down and
  fails the gate on one left open. Anything walking those schemas reads through `allOf`: the
  generator wraps a `$ref` in one as soon as the property carries a description of its own, so a
  reader looking for a bare `$ref` sees a described nested object as carrying no schema at all.
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

Every domain mutation goes through
[`MutationService`](../../apps/api/src/mutations/mutation.service.ts), and what it buys is
atomicity, not a journal (ADR-006). One user operation is one database transaction, or
nothing at all. The invariant it protects is 5.5. A composite write torn in half (a
transfer leg without its pair) is the main way to break it, and PRD 6.3 requires a
transfer to be atomic regardless. So a transfer's two legs share a `transferId` and are
created, edited and deleted together.

Which models it owns is a registry, `MUTATION_GUARDED_MODELS` in
[`scoped-models.ts`](../../apps/api/src/prisma/scoped-models.ts), and every model in the schema
is either in it or in the exemption list beside it. Being under the mutator is not a claim that
an operation is undoable. The undo scope is ADR-006's and lives in the browser; a rename and an
archive go through the same point for atomicity and nothing else.

**`Assignment` has exactly one writer**, [`apps/api/src/moves`](../../apps/api/src/moves), and
that is a narrower claim than the mutator's. Assigning money and moving it are one operation,
because ready to assign is an envelope that is derived rather than stored: writing an amount
into a category **is** a move out of the pool. So the inverse of a move is the same move with
its sides swapped, which is what the undo stack in the browser stands on, and a second writer
would be a second inverse for it to disagree with. Not left to memory: the restriction
`assignment-writes`, composed into `@rondo/config/eslint/tenant-isolation`, fails the gate on a
write to that model anywhere but there and the tests.

A mutation opened inside another one is refused. Postgres has no nested interactive
transaction, so the inner one would commit on its own and claim a second key. Compose the whole
operation in a single `run` instead.

A raw statement issued on the pooled client would land **outside** the mutator's transaction:
a write would survive its rollback, and a read would not see what it has written. So inside a
mutation the raw repository takes that transaction, and what each half refuses is in
[security](security.md).

The same transaction carries the idempotency key. `IdempotencyKey` is unique per (user, key).
The row is claimed first, so a concurrent duplicate waits on that index instead of doing the
work twice, and the mutation's result is written onto it before the transaction commits. A
repeat therefore hits the index and is answered with the stored result, as if it had just run.
Two consequences of the index doing the work. The conflict takes the **whole** transaction
down, so the stored result is read afterwards, on a separate query, never inside. And the row
carries a fingerprint of the request it was claimed for: a second, different intent wearing the
first one's key is refused rather than answered with a result that describes a write it never
made.

There is no server-side change log and no soft-delete. Deletion is physical, and undo
lives in the browser as a stack of money operations, each inverted through the same API
(ADR-006). Its scope is the part that cannot be re-derived: transactions and moves between
envelopes. RTA is an envelope too, so setting an Assigned amount **is** a move and
undoes like one; a rename, an archive and a hide are not undoable at all. Nothing on the
server replays history.

## Money, dates, schema

- Money is an integer number of minor units in `bigint`, a string over the wire, and its
  digit count comes from the currency and never from a hardcoded `2`. The convention and its
  helpers belong to [`packages/types`](../../packages/types/README.md); never re-derive them.
  Two consequences the rest of the codebase has to honour: the digit count is **frozen on the
  budget row** rather than recomputed per read, and a runtime upgrade that
  moves the currency data is a migration rather than a bump. An amount written at one scale
  and read at another is money multiplied by a hundred.
- Dates are calendar dates without time. "Today" and `YYYY-MM` bucketing are computed in
  one reference timezone, the budget's `timezone` column, through
  [`calendar.ts`](../../packages/types/src/calendar.ts) and never a `new Date()` scattered
  across call sites.
- The schema grows one migration per phase. A category is never deleted, only hidden
  (`hiddenAt`). That is a visibility marker, not a soft-delete. The
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

### Where a screen's look comes from

A screen is not designed twice. When the ticket carries a design, that design is the
specification, and prose describing it is a summary rather than a replacement.

1. **A design link in the ticket is read before the screen is written**, not after it is
   reviewed. Open every artboard, take the copy, the order of the fields, the states and the
   responsive behaviour from it. A plan that paraphrases the design is still second-hand; the
   artboards win wherever the two differ. When the design and a recorded decision genuinely
   conflict, the user decides, the same way an open question does.
2. **Icons come from `@tabler/icons-react`.** Never paste a raw `<svg>` out of a mock. Match
   the path data to the icon it is and import that one by name, so the set stays consistent and
   a mock's snapshot never becomes a second icon library.
3. **Look for the component before inventing one**, in this order: `packages/ui`, then the
   shadcn registry (the paragraph below has the command), then a composition of primitives
   rather than bare markup. What
   the ladder buys is that radii, icons and spacing arrive right instead of being tuned by
   hand, and a hand-written trigger beside a generated one is how a design system stops being
   one. Reuse the tokens the neighbouring primitive carries rather than values that look
   close.

Screens are composed from Tailwind utilities and shadcn/ui components in `packages/ui`
(the theme and the generator settings are described in
[`packages/ui`](../../packages/ui/README.md)). No hand-written CSS files, no inline `style`
props outside the one case the next paragraph bounds, no bespoke
re-implementation of a primitive shadcn/ui ships. Missing one? Add it with
`pnpm dlx shadcn@latest add <component>` into `packages/ui`. That one stops for the user's
confirmation (`ask` in [`settings.json`](../settings.json)), because `pnpm dlx` fetches and
executes a package and nothing does that unattended here.

**An inline `style` is allowed for one thing: a value computed per element at runtime.** An
animation delay taken from a cell's position is the case; a colour, a size or a spacing never
is. What draws the bound is Tailwind rather than taste. Its scanner reads the source, so a
class name assembled from a variable names a class that was never generated, and an arbitrary
value only works when it is written out in full. Anything a static utility can say therefore
stays a utility, and reaching for `style` because a class is awkward is the thing this rule
refuses. A custom animation is **not** this case: its keyframes and the `--animate-*` variable
that names it go in `@theme` in
[`globals.css`](../../apps/web/src/app/globals.css), the theme's entry point, and the screen
then uses the utility that variable creates.

### A route that needs a state of the data is closed by a gate

Setup has a state, and a route behind it is unreachable until that state is right. The gate is
one client component in the layout of the route group
([`apps/web/src/components/onboarding-gate.tsx`](../../apps/web/src/components/onboarding-gate.tsx)),
and the reading of the state lives beside it as a plain function
([`lib/onboarding.ts`](../../apps/web/src/lib/onboarding.ts)), so what each answer means is
written once and testable without a browser. Three rules make one work:

- **it decides on this mount's own answer.** A cached one can be older than the row it is being
  asked about, and a failed read knows nothing at all. Neither is a reason to move a user, so
  the gate waits, and says the check failed rather than guessing;
- **it decides once per route and per user, then holds.** The screens behind a gate create the
  very rows it reads and invalidate those queries on success, so an answer arriving a moment
  later would tear the confirmation off the screen. What resets the verdict is the step it
  guards changing, or the signed-in user changing, and nothing else. Navigating between two
  routes a single gate covers holds the verdict, which is what keeps the shell from deciding
  again on every section. One layout wraps every step, so neither unmounts it;
- **it renders nothing it is about to move the user away from.** Not the shell, not the form.
  A screen shown for one frame before a redirect is a screen the user can act on.

A gate is a decision about where a user belongs, not a security boundary. What stops a request
is the API.

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
- **Mutations** invalidate through the generated query keys, and through the **generated** ones
  rather than a string that looks like the operation: the key is an object carrying an id, a
  base URL and the request, so a hand-written literal matches nothing and the screen goes on
  showing money the server has already moved past. Expect the invalidation to be wide. No
  derived value is stored, so one assignment moves RTA and every later month's Available at
  once. Their idempotency key belongs to the user's intent, so it is minted once when the form
  opens, not per HTTP request. Otherwise a double click writes twice. A field that edits an
  amount has more rules than that, and
  [`edit-money-on-a-screen`](../skills/edit-money-on-a-screen/SKILL.md) holds them.
