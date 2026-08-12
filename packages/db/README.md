# @ffai/db

Data layer: Prisma schema, migrations and the generated client — skeleton F0.4 (Prisma 7).

The schema grows incrementally: each phase brings its own migration. F0.4 is the base
skeleton (datasource + generator + an empty initial `0_init` migration); domain tables
(users, budgets, the `ChangeLog` journal) arrive in Phases 1–2.

## What it exports

`PrismaClient` and types from the generated client. Prisma 7 is Rust-free: the new
`prisma-client` generator emits **TypeScript** into `src/generated/prisma` (git-ignored),
so the package compiles into `dist` with its own build step (`tsc`). Consumers take types
from the sources (`exports.types → src/index.ts`), runtime — from `dist`
(`exports.default → dist/index.js`).
Once hand-written TypeScript appears (the scoping Client Extension and the raw-aggregates
repository), it lives here too.

Runtime DB connection goes through a **driver adapter** (`@prisma/adapter-pg`), created
by `PrismaService` in `apps/api`. The URL is no longer specified in the schema (Prisma 7);
it lives in `prisma.config.ts` and is only needed for Migrate.

## Scripts

```bash
pnpm --filter @ffai/db build         # prisma generate + tsc → dist
pnpm --filter @ffai/db db:generate   # prisma generate
pnpm --filter @ffai/db db:migrate    # prisma migrate dev (requires a running Postgres)
pnpm --filter @ffai/db db:deploy     # prisma migrate deploy (prod)
pnpm --filter @ffai/db db:studio     # prisma studio
```

`DATABASE_URL` is loaded from the root `.env` directly in `prisma.config.ts` (see
`.env.example` and `docker-compose.yml`); on Railway — from real environment variables.
Short aliases are available from the repo root: `pnpm db:generate` and `pnpm db:migrate`.
