---
name: add-a-domain-module
description: Add an API module in apps/api that reads a domain table, with the controller, service, response class, registration and the tests that are not optional. Use when a feature needs a read endpoint backed by Postgres. A module that writes a guarded model goes through the mutation service instead, which the add-a-mutation skill covers.
---

# Add a domain module

The shape every module that touches a table follows. It is not a template to fill in.
[`apps/api/src/user-settings`](../../../apps/api/src/user-settings) is the module this
describes, so read it alongside. Read its `GET` half: the same module also carries a `PATCH`
through the mutation service, which is the other skill's subject, and every decision below is
visible in the read.

Scope: the **read** path. A mutation goes through the single mutation service, which puts the
whole user operation and its idempotency key in one transaction (ADR-006); that is
[`add-a-mutation`](../add-a-mutation/SKILL.md), and a module that does both follows one skill
per path.

## Before writing anything

1. Read the phase ticket and the ADRs covering the area (see `.claude/rules/specs.md`). What is
   already decided is not yours to re-derive.
2. Decide where the shape lives. A DTO shared with `apps/web` belongs in `packages/types`; a
   shape that exists only as one endpoint's response body is the response class itself.

## 1. The DTO in `packages/types`

[`user-settings.ts`](../../../packages/types/src/user-settings.ts) plus a re-export from
`src/index.ts`. **Relative imports inside that package carry a `.js` extension.** That is a
convention kept by hand, not something the compiler asks for. The package is CommonJS, and
extensionless imports resolve there perfectly well. Writing them keeps the specifiers valid if
it ever becomes ESM, where they would stop being optional.

Values may be imported from `@rondo/types` at runtime. The package emits to `dist`
(`exports.default`), which is what lets `apps/api` call `parseMoney` and not merely name its
type. Before that it had no build step, and a value import left `require('@rondo/types')` in
`dist` pointing at a `.ts` file, so the api built and then failed to boot. Two things follow: a
new runtime export has to be reachable from `src/index.ts`, and a domain constant that is
genuinely api-only still belongs in `apps/api`, the way
[`language.ts`](../../../apps/api/src/user-settings/language.ts) keeps the Prisma-enum mapping.

## 2. The schema in `packages/db`

- Follow the naming set by the first table: PascalCase models, camelCase fields, snake_case
  tables and columns via `@@map` / `@map`, ids as `String @id @default(uuid(7)) @db.Uuid`.
- A user-owned model carries `userId` and **joins
  [`scoped-models.ts`](../../../apps/api/src/prisma/scoped-models.ts) in the same change**
  (ADR-005). A model one budget owns carries `budgetId` and joins `BUDGET_SCOPED_MODELS` in
  the same file. `apps/api/test/scoped-models.spec.ts` fails the gate on either omission.
- **That same model joins the erase**,
  [`erase-user-data.query.ts`](../../../apps/api/src/me/erase-user-data.query.ts), which deletes
  everything one caller owns with a statement per table. `apps/api/test/erase-user-data-query.spec.ts`
  fails the gate on a model with no statement, and on a statement naming another model's table.
  What no test can check for you is where the statement goes: every relation is `onDelete:
Restrict`, so a child is deleted before its parent or the whole sweep fails on the foreign
  key.
- A new NOT NULL column on an existing table needs a default, or the migration will not apply.

```bash
pnpm --filter @rondo/db exec prisma migrate dev --name <change>
pnpm --filter @rondo/db build   # both steps: prisma generate AND tsc → dist
```

The build is separate and mandatory, and in a `pnpm dev` session `db:generate` is enough.
[`packages/db/README.md`](../../../packages/db/README.md) owns both cases and what skipping it
looks like.

## 3. The module in `apps/api/src/<feature>/`

Five files, in the order they depend on each other.

**`<feature>.response.ts`** is a **class**, one `@ApiProperty` per field, and it `implements`
the DTO. An interface leaves no metadata after compilation, so the endpoint is published with
no shape at all and the generated client types it `unknown`. For an enum, pass `enumName` as
well. Without it the client gets `string` instead of a union, so _verify that in
`packages/api-client/src/generated/types.gen.ts` after regenerating_ rather than trusting it.
Publish only what a client needs; a field is far harder to withdraw from a contract than to add.

**`<feature>.service.ts`** injects `SCOPED_PRISMA`, never `PrismaService`. Get-or-create is
read first, then `upsert` on the miss. That write is legal outside a mutation only because
`UserSettings` is on the exemption list; the same shape on a guarded model belongs in
[`add-a-mutation`](../add-a-mutation/SKILL.md). The extension rewrites an upsert's `update` payload, so an
unconditional upsert would issue a real UPDATE on every read and pin `updatedAt` to the last time
anyone opened a screen. The `upsert` on the miss is what keeps two concurrent first
requests from colliding on the unique index. The extension adds
`where userId` to reads and stamps it on writes, so the service writes ordinary Prisma calls and
_cannot_ reach another tenant's rows. Two things it does not cover, both load-bearing:

- `$queryRaw` / `$executeRaw`: raw SQL goes through `ScopedRawRepository` in `src/raw-sql`, and
  a lint rule fails the gate anywhere else;
- **nested writes**: only top-level operations are rewritten, so a relation written inside
  another model's `data` keeps whatever `userId` the caller put there.

A model a budget owns gets a second filter, taken from the caller's active budget, which the
extension looks up on the first query that needs it and remembers for the rest of the request.
It covers reads and the writes that pick out existing rows; a write that creates them carries
its own budget in the payload instead. Which operations fall on
which side, and why, is in [security](../../rules/security.md). An operation issued when the
caller has no active budget is **refused**, and what that refusal is depends on who asks first.
The extension raises a plain `Error`, which reaches the caller as a 500 for an ordinary state,
a user part way through onboarding. So a service reading a budget-owned model asks for the
active budget itself and answers 400 when there is none, the way
[`AccountsService`](../../../apps/api/src/accounts/accounts.service.ts) does. Nothing sets one
by hand: the lookup does not
remember an absence, so the request that creates the first budget is answered by the next query
that needs one. A unit test calling the scoped client by hand supplies its own resolver, or
sets the budget itself. The pattern is in
[`budget-scoping.integration.spec.ts`](../../../apps/api/test/budget-scoping.integration.spec.ts).

Pass the verified caller's `userId` on a write and let the extension overwrite it. That the
wrong value is harmless is the property being relied on, not an invitation to be careless.
Which of Prisma's two write inputs carries the field at all is in
[security](../../rules/security.md), and taking the wrong one is a runtime failure the types
do not catch.

**`<feature>.controller.ts`** takes its identity from `@CurrentUserId()` and nothing else.
Never the body, a query parameter or a header, however convenient. With no RLS behind us
nothing further down would catch it. Document the handler with `@ApiOperation`,
`@ApiOkResponse({ type })` and `@ApiUnauthorizedResponse`, because the spec _is_ the client.
A handler that can answer 400 adds `@ApiBadRequestResponse` with
[`BadRequestResponse`](../../../apps/api/src/openapi/bad-request.response.ts), and one taking a
DTO body always can, because the global pipe answers before it. An undocumented status leaves
the client's whole error type `unknown`.
`@Public()` opens an endpoint to both the guard and the spec at once; never add a second
decorator saying the same thing.

**`<feature>.module.ts`** needs a line in
[`app.module.ts`](../../../apps/api/src/app.module.ts). A module nobody imports serves nothing.

**Pure logic gets its own file.** Header parsing, a mapping table, a date bucket all live apart
from the service, so each is unit-testable without a database
([`accept-language.ts`](../../../apps/api/src/user-settings/accept-language.ts)).

## 4. The contract: regenerated, never edited

`apps/api/openapi.json` and `packages/api-client/src/generated` are committed artefacts. The
pre-commit hook regenerates and stages them; CI fails on any difference. Do not hand-edit one to
fix something; change the NestJS code that produces it. If the hook refuses the commit, it is
saying the contract moved while some of its sources are unstaged. Stage them, or set them aside
with `git stash -u`.

## 5. The tests: all three, in the same change

`docs/testing.md` has the levels and commands. The minimum for a module that touches a table:

- **unit**, for the pure logic: enumerate the cases, do not reach for fast-check on a named
  space ([`accept-language.spec.ts`](../../../apps/api/test/accept-language.spec.ts));
- **integration**, for the endpoint over HTTP: a signed token, a real request, and every
  assertion about what was stored made through the **unscoped** `PrismaService`, because a count
  taken through the scoped client cannot tell "B has no row" from "B cannot see its row"
  ([`user-settings.integration.spec.ts`](../../../apps/api/test/user-settings.integration.spec.ts));
- **cross-tenant, mandatory** (ADR-005): user A's data exists, user B calls the endpoint, and B
  gets its own data while A's row is untouched. The model's isolation being proven elsewhere is
  not the same claim. This one is about the endpoint.

Cover the edges the feature actually has: the empty case, the second call, concurrent first
calls, and an anonymous caller (401).

## What this leaves you to decide

Nothing about identity, scoping or the contract. Those are settled above. What is still a
judgement call is the endpoint's own semantics, and it belongs in the ticket: whether a read may
create, what the fallback is when input says nothing usable, and which fields are published at
all. `GET /user-settings` answers all three in its `@ApiOperation` and `@ApiHeader`
descriptions; a new module owes the same, in the published contract rather than in a comment.
