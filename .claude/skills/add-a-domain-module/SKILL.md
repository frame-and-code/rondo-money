---
name: add-a-domain-module
description: Add an API module in apps/api that reads or writes a domain table — controller, service, response class, registration and the tests that are not optional. Use when a feature needs a new endpoint backed by Postgres.
---

# Add a domain module

The shape every module that touches a table follows. It is not a template to fill in:
[`apps/api/src/user-settings`](../../../apps/api/src/user-settings) is the module this
describes, so read it alongside — five small files, and every decision below is visible in one
of them.

Scope: the **read** path (F1.6). A mutation additionally goes through the single mutation
service and writes its `ChangeLog` entry in the same transaction (F2.2, ADR-001) — that is a
separate skill, and until it exists a write is a design conversation, not a copy.

## Before writing anything

1. Read the phase ticket and the ADRs covering the area (see `.claude/rules/specs.md`). What is
   already decided is not yours to re-derive.
2. Decide where the shape lives. A DTO shared with `apps/web` belongs in `packages/types`; a
   shape that exists only as one endpoint's response body is the response class itself.

## 1. The DTO — `packages/types`

[`user-settings.ts`](../../../packages/types/src/user-settings.ts) plus a re-export from
`src/index.ts`.

⚠️ **Export it as a type, and import it as a type.** `@rondo/types` has no build step
(`main: ./src/index.ts`) and `nest build` compiles only `apps/api/src`, so a runtime import of
a _value_ from that package leaves `require('@rondo/types')` in `dist` pointing at a `.ts`
file — the api builds and then fails to boot. A runtime constant that both sides need is
declared in `apps/api` and mapped to the type, the way
[`language.ts`](../../../apps/api/src/user-settings/language.ts) does.

## 2. The schema — `packages/db`

- Follow the naming set by the first table: PascalCase models, camelCase fields, snake_case
  tables and columns via `@@map` / `@map`, ids as `String @id @default(uuid(7)) @db.Uuid`.
- A user-owned model carries `userId` and **joins
  [`scoped-models.ts`](../../../apps/api/src/prisma/scoped-models.ts) in the same change**
  (ADR-005). `apps/api/test/scoped-models.spec.ts` fails the gate if it does not.
- A new NOT NULL column on an existing table needs a default, or the migration will not apply.

```bash
pnpm --filter @rondo/db exec prisma migrate dev --name <change>
pnpm --filter @rondo/db build   # both steps: prisma generate AND tsc → dist
```

The build is separate and mandatory — `migrate dev` does not regenerate the client here, and
skipping it shows up as models typed `never` or a missing delegate at runtime
(`packages/db/README.md` measured this).

## 3. The module — `apps/api/src/<feature>/`

Five files, in the order they depend on each other.

**`<feature>.response.ts`** — a **class**, one `@ApiProperty` per field, `implements` the DTO.
An interface leaves no metadata after compilation, so the endpoint is published with no shape
at all and the generated client types it `unknown`. For an enum, pass `enumName` as well:
without it the client gets `string` instead of a union — and _verify that in
`packages/api-client/src/generated/types.gen.ts` after regenerating_, rather than trusting it.
Publish only what a client needs; a field is far harder to withdraw from a contract than to add.

**`<feature>.service.ts`** — injects `SCOPED_PRISMA`, never `PrismaService`. The extension adds
`where userId` to reads and stamps it on writes, so the service writes ordinary Prisma calls and
_cannot_ reach another tenant's rows. Two things it does not cover, both load-bearing:

- `$queryRaw` / `$executeRaw` — raw SQL goes through `ScopedRawRepository` in `src/raw-sql`, and
  a lint rule fails the gate anywhere else;
- **nested writes** — only top-level operations are rewritten, so a relation written inside
  another model's `data` keeps whatever `userId` the caller put there.

Prisma's types still ask for `userId` on a write; pass the verified caller's and let the
extension overwrite it. That the wrong value is harmless is the property being relied on, not
an invitation to be careless.

**`<feature>.controller.ts`** — `@CurrentUserId()` is the only source of identity. Never the
body, a query parameter or a header, however convenient: with no RLS behind us nothing further
down would catch it. Document the handler — `@ApiOperation`, `@ApiOkResponse({ type })`,
`@ApiUnauthorizedResponse` — because the spec _is_ the client. `@Public()` opens an endpoint to
both the guard and the spec at once; never add a second decorator saying the same thing.

**`<feature>.module.ts`** and a line in
[`app.module.ts`](../../../apps/api/src/app.module.ts) — a module nobody imports serves nothing.

**Pure logic gets its own file.** Header parsing, a mapping table, a date bucket: separate from
the service, so it is unit-testable without a database
([`accept-language.ts`](../../../apps/api/src/user-settings/accept-language.ts)).

## 4. The contract — regenerated, never edited

`apps/api/openapi.json` and `packages/api-client/src/generated` are committed artefacts. The
pre-commit hook regenerates and stages them; CI fails on any difference. Do not hand-edit one to
fix something — change the NestJS code that produces it. If the hook refuses the commit, it is
saying the contract moved while some of its sources are unstaged: stage them, or set them aside
with `git stash -u`.

## 5. The tests — all three, in the same change

`docs/testing.md` has the levels and commands. The minimum for a module that touches a table:

- **unit**, for the pure logic — enumerate the cases, do not reach for fast-check on a named
  space ([`accept-language.spec.ts`](../../../apps/api/test/accept-language.spec.ts));
- **integration**, for the endpoint over HTTP: a signed token, a real request, and every
  assertion about what was stored made through the **unscoped** `PrismaService` — a count taken
  through the scoped client cannot tell "B has no row" from "B cannot see its row"
  ([`user-settings.integration.spec.ts`](../../../apps/api/test/user-settings.integration.spec.ts));
- **cross-tenant, mandatory** (ADR-005): user A's data exists, user B calls the endpoint, and B
  gets its own data while A's row is untouched. The model's isolation being proven elsewhere is
  not the same claim — this one is about the endpoint.

Cover the edges the feature actually has: the empty case, the second call, concurrent first
calls, and an anonymous caller (401).

## What this leaves you to decide

Nothing about identity, scoping or the contract — those are settled above. What is still a
judgement call is the endpoint's own semantics, and it belongs in the ticket: whether a read may
create, what the fallback is when input says nothing usable, and which fields are published at
all. `GET /user-settings` answers all three in its controller's doc comment; a new module owes
the same paragraph.
