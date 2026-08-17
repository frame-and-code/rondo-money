# @rondo/db

Data layer: Prisma schema, migrations and the generated client — skeleton F0.4 (Prisma 7).

The schema grows incrementally: each phase brings its own migration. F0.4 is the base
skeleton (datasource + generator + an empty initial `0_init` migration); F1.3 adds the first
table, `UserSettings`, and the `ChangeLog` journal plus the domain core arrive in Phases 2–3.

`UserSettings` carries only identity and timestamps for now — its `language` column and the
endpoint that reads it belong to F1.6. It exists this early because the `userId` auto-scoping
extension in `apps/api` cannot be typed against a schema with no models at all.

## Conventions

Set by the first table and followed by every later one:

- models are **PascalCase** and fields **camelCase** in Prisma; tables and columns are
  **snake_case** in Postgres via `@@map` / `@map`. Not cosmetic: the raw aggregates of
  Phases 4–5 are hand-written SQL, and `where user_id = $1` needs no quoting where
  `where "userId" = $1` does;
- ids are `String @id @default(uuid(7)) @db.Uuid` — time-ordered, and a real `uuid` column
  rather than `text`, which is what `@db.Uuid` buys;
- every table carrying user data has `userId`, and joins the scoped-model registry in
  `apps/api/src/prisma/scoped-models.ts` **in the same change** (ADR-005).

⚠️ **After a migration, run `pnpm --filter @rondo/db build`.** It does both things the api
needs and nothing else does: `prisma generate` (consumers read types from `src/`, per
`exports.types`) and `tsc` (`dist/index.js`, the runtime entry every consumer actually loads,
per `exports.default`).

Skipping it fails in two different-looking ways, which is why the command matters more than the
diagnosis: the api typechecks against the previous schema (models resolve to `never` — the same
symptom an unbound `Prisma.defineExtension` produces, so check the build first), or, with fresh
types and a stale `dist`, integration tests and `nest start` fail on a delegate that is not
there.

⚠️ **The CLI's own help contradicts this, and the help is wrong.** `prisma migrate dev --help`
(7.9.1) says it will "apply it to the database, trigger generators (e.g. Prisma Client)", and
the `--skip-generate` opt-out no longer exists — yet measured twice here, on a real schema
change, the command applied the migration and left the client untouched: no "Generated Prisma
Client" line in its output and the new field absent from `src/generated` until `build` ran.
Don't spend the next hour re-deriving that; run the build.

## What it exports

`PrismaClient` and types from the generated client. Prisma 7 is Rust-free: the new
`prisma-client` generator emits **TypeScript** into `src/generated/prisma` (git-ignored),
so the package compiles into `dist` with its own build step (`tsc`). Consumers take types
from the sources (`exports.types → src/index.ts`), runtime — from `dist`
(`exports.default → dist/index.js`).

This package stays schema-and-client only. The auto-scoping Client Extension and the raw-SQL
repository live in `apps/api` (`src/prisma`, `src/raw-sql`), because both read the caller from
the request context, which is a backend concern — see `apps/api/README.md`.

Runtime DB connection goes through a **driver adapter** (`@prisma/adapter-pg`), created
by `PrismaService` in `apps/api`. The URL is no longer specified in the schema (Prisma 7);
it lives in `prisma.config.ts` and is only needed for Migrate.

## Scripts

```bash
pnpm --filter @rondo/db build         # prisma generate + tsc → dist
pnpm --filter @rondo/db db:generate   # prisma generate
pnpm --filter @rondo/db db:migrate    # prisma migrate dev (requires a running Postgres)
pnpm --filter @rondo/db db:deploy     # prisma migrate deploy (prod)
pnpm --filter @rondo/db db:studio     # prisma studio
```

`DATABASE_URL` is loaded from the root `.env` directly in `prisma.config.ts` (see
`.env.example` and `docker-compose.yml`); on Railway — from real environment variables.
Short aliases are available from the repo root: `pnpm db:generate` and `pnpm db:migrate`.
