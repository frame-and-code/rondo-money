# @rondo/db

Data layer: Prisma schema, migrations and the generated client (Prisma 7).

The schema grows incrementally, one migration per phase. It starts as a datasource, a
generator and an empty `0_init`. `UserSettings` is the first table, then the domain core
arrives in a single migration: `Budget`, `CategoryGroup`, `Category`, `Account`,
`Transaction`, `IdempotencyKey`. `Assignment` joins them later, with the two columns that give
a category a look of its own, and `CategoryTarget` after it. No table carries `deletedAt`.
ADR-006 dropped soft-delete and the change-log journal alike.

`UserSettings` carries identity, timestamps and the interface language (`Language` enum with
`RU` / `EN` / `PL`, defaulting to `EN`). It exists this early because the `userId` auto-scoping
extension in `apps/api` cannot be typed against a schema with no models at all.

`Budget` owns the money settings the rest of the schema reads: the ISO 4217 `currency`, the
`minorDigits` frozen when the budget is created, and the IANA `timezone` that decides what
today is. A user may hold several budgets and **at most one** of them is `active`. A partial
unique index on `(user_id, active) where active` holds that, so a second activation fails on
the index. It cannot require a first one, and it is not meant to: a user part-way through
onboarding has no active budget, and every reader handles that.

That index is why the schema turns on the `partialIndexes` preview feature, and three things
follow.

A Prisma release that **removes** the name is a hard stop: the schema fails to parse, and
`migrate deploy` goes down with it, because the whole schema is validated before any
connection is opened. A release that graduates the feature to general availability is the
opposite, a `warn` line and an exit code of zero, which nothing in CI turns into a failure.
So a Prisma upgrade checks for the warning, not only for the error, and deletes the flag when
it appears.

The index publishes `userId_active` as a compound unique key on `Budget`, and the generated
types carry no trace of the predicate. Only `active: true` is really unique, and the key gives
no sign of that. Each operation loses the guarantee differently. A read naming `active: false`
answers with an arbitrary matching row. An `update` or a `delete` is the dangerous one: it
writes or removes **every** row that matches and raises the error afterwards, so the caller
gets a failure over data that has already changed. An `upsert` names a conflict target
Postgres cannot match to an index carrying a predicate, and fails there. So read with
`active: true`, and create or activate a budget with an explicit read and then a write inside
the mutation's own transaction. `budget-core.integration.spec.ts` pins all four, because this
paragraph is the only warning a caller gets.

`Assignment` holds what one category was given for one month. `month` is a `date` column
carrying the first day, so which month a date falls in is decided once, in the budget's
timezone, by the calendar helpers in [`@rondo/types`](../types/README.md). One row per category
and month is what lets a move edit an assignment instead of stacking a second one beside it, and
it takes two things rather than one: `@@unique([categoryId, month])` is unique per stored **day**,
so a check constraint holds `month` to the first of its month. Prisma cannot declare one, so that
constraint lives in the migration and nowhere else. The `amount` is signed and nothing bounds it: a month that gives money
back is an ordinary negative row, and no aggregate is stored anywhere.

⚠️ **An upsert on that pair reaches only the active budget, and its result type does not say
so.** The scoping extension puts the caller and the active budget into the `where` half, so an
upsert aimed at the pair of a row that scope does not reach matches nothing. What comes back
then depends on the payload rather than on who owns that row. When `create` names the budget the
scope carries, Prisma compiles one `INSERT ... ON CONFLICT ... DO UPDATE` whose `WHERE` filters
the conflicting row out, nothing is written and the answer is `null`. When it names another
budget, Prisma falls back to a select and a plain insert, and that insert fails on the unique
index with `P2002`. Prisma types the result as a row in both cases, so `(await scoped.assignment.upsert(...)).id`
compiles and then throws at runtime. A move that edits an assignment either handles both
answers or reads and writes inside its own transaction instead.

`Category` carries an optional `icon` and `color`, each a short name of at most 32 characters
rather than a component name or a hex value. A group carries neither, and a category without
them is a normal row.

`CategoryTarget` holds what a category is aiming at, and a category keeps every goal it has
run rather than overwriting them. Three date columns describe when each one applies:
`startMonth`, the month it began in; `dueMonth`, the month a goal saving by a date is due;
and `endMonth`, the last month it is shown in, which is the month the user closed it in or
the month before a replacement starts. A goal is read in a month when that month is not
before its start and not after whichever of the other two it carries, so the month named by
`dueMonth` or `endMonth` still shows it and the next one does not. All three are `date`
columns carrying the first day, and check constraints in the migration hold them there, for
the reason `Assignment.month` has one.

`@@unique([categoryId, startMonth])` is what makes a second goal in the same month an edit of
that row rather than a row beside it, and it is why a write picks its branch under the
category's own lock: without the lock two concurrent writes both insert and the loser comes
back as an idempotency conflict it never made
([`pick-the-active-row`](../../.claude/skills/pick-the-active-row/SKILL.md)).

What the envelope carried in when a goal started is summed on read rather than stored: the
assignments and the transactions before the starting month. A goal saving toward a total
counts its progress from that sum, and a goal asking for a monthly amount ignores it. So
correcting a record in a month before the goal started corrects the goal's progress with it,
and the envelope and the goal never drift apart.

Three fields mean three different kinds of disappearance and they are not interchangeable.
An account is archived (`archivedAt`), a category and its group are hidden (`hiddenAt`), a
budget is deactivated (`active`). A transaction is deleted outright. Hiding is never applied
as an automatic filter; what that means for the aggregates is in
[architecture](../../.claude/rules/architecture.md).

## A child cannot leave its parent's budget

Every child names its parent through a **composite** foreign key rather than two independent
ones: `(budget_id, user_id)` to the budget, and `(group_id, budget_id)`,
`(account_id, budget_id)` or `(category_id, budget_id)` to the row inside it. Two separate keys
would each pass on their own while the pair made no sense: a category naming this budget and a
group from another one, and a read confined to the first budget then pulling the second one's
group in over the relation. The target of each is a `@@unique` on the parent, which is what
`Budget @@unique([id, userId])` and the `@@unique([id, budgetId])` on the three others exist
for. An `UPDATE` moving a row into another budget while its parent stays behind fails the same
way an `INSERT` does.

One hole this shape does not cover, and it is the standard SQL one: a composite key over a
nullable column is `MATCH SIMPLE`, so `Transaction`'s `(category_id, budget_id)` is not checked
at all when `category_id` is null. That is the wanted behaviour, since an income carries no
category, but it means the key says nothing about a row without one.

`IdempotencyKey` carries a `request_fingerprint` beside the key. A repeat is answered with the
stored `result`; a repeat whose fingerprint differs is a second intent wearing the first one's
key, and the api refuses it. Why it refuses rather than replaying is in
[architecture](../../.claude/rules/architecture.md).

## Conventions

Set by the first table and followed by every later one:

- models are **PascalCase** and fields **camelCase** in Prisma; tables and columns are
  **snake_case** in Postgres via `@@map` / `@map`. Not cosmetic. The raw aggregates of
  Phases 4–5 are hand-written SQL, and `where user_id = $1` needs no quoting where
  `where "userId" = $1` does;
- ids are `String @id @default(uuid(7)) @db.Uuid`, time-ordered, and a real `uuid` column
  rather than `text`, which is what `@db.Uuid` buys;
- every table carrying user data has `userId`, and joins the scoped-model registry in
  `apps/api/src/prisma/scoped-models.ts` **in the same change** (ADR-005). A table that
  belongs to one budget carries `budgetId` too, and joins the budget registry beside it;
- a field is **named** so that the column the rule above produces is not a reserved word in
  Postgres. The order of a category is `sortOrder`, not `order`, because `order` would have
  to be quoted in exactly the hand-written SQL the snake_case convention exists to keep
  unquoted.

⚠️ **After a migration, run `pnpm --filter @rondo/db build`.** It does both things the api
needs and nothing else does: `prisma generate` (consumers read types from `src/`, per
`exports.types`) and `tsc` (`dist/index.js`, the runtime entry every consumer actually loads,
per `exports.default`).

Skipping it fails in two different-looking ways, which is why the command matters more than the
diagnosis. Either the api typechecks against the previous schema (models resolve to `never`,
the same symptom an unbound `Prisma.defineExtension` produces, so check the build first), or,
with fresh types and a stale `dist`, integration tests and `nest start` fail on a delegate that
is not there.

**In a `pnpm dev` session the `tsc` half is automatic and the generate is not.** The watcher
re-emits `dist` whenever `src/generated` changes, but nothing changes it until
`prisma generate` runs. The loop itself is described in
[`apps/api/README.md`](../../apps/api/README.md). So with the session up a migration ends with
`pnpm --filter @rondo/db db:generate` and the rest happens by itself; with them down, it ends
with the full `build`.

⚠️ **`prisma migrate dev` does not regenerate the client**, whatever its own `--help` claims.
Run the generate yourself.

## What it exports

`PrismaClient` and types from the generated client. Prisma 7 is Rust-free. The new
`prisma-client` generator emits **TypeScript** into `src/generated/prisma` (git-ignored),
so the package compiles into `dist` with its own build step (`tsc`). Consumers take types
from the sources (`exports.types → src/index.ts`) and the runtime from `dist`
(`exports.default → dist/index.js`).

This package stays schema-and-client only. The auto-scoping Client Extension and the raw-SQL
repository live in `apps/api` (`src/prisma`, `src/raw-sql`), because both read the caller from
the request context, which is a backend concern. See `apps/api/README.md`.

Runtime DB connection goes through a **driver adapter** (`@prisma/adapter-pg`), created
by `PrismaService` in `apps/api`. The URL is no longer specified in the schema (Prisma 7);
it lives in `prisma.config.ts` and is only needed for Migrate.

## Scripts

```bash
pnpm --filter @rondo/db dev           # tsc --watch → dist (what `pnpm dev` runs)
pnpm --filter @rondo/db build         # prisma generate + tsc → dist
pnpm --filter @rondo/db db:generate   # prisma generate
pnpm --filter @rondo/db db:migrate    # prisma migrate dev (requires a running Postgres)
pnpm --filter @rondo/db db:deploy     # prisma migrate deploy (prod)
pnpm --filter @rondo/db db:reset      # prisma migrate reset, drops the local database
pnpm --filter @rondo/db db:studio     # prisma studio
```

`DATABASE_URL` is loaded from the root `.env` directly in `prisma.config.ts` (see
`.env.example` and `docker-compose.yml`); on Railway it comes from real environment variables.
Short aliases are available from the repo root: `pnpm db:generate`, `pnpm db:migrate` and
`pnpm db:reset`.
