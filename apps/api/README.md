# @ffai/api

Fin Flow AI backend on **NestJS (REST)** — skeleton F0.4.

For now there is only a healthcheck; domain modules, the single mutation point and the
single read point (scoped by `userId`/`budgetId`) are added in Phases 1–2.

## Endpoints

- `GET /health` — checks the DB connection (`SELECT 1` via Prisma). `200` if the DB
  is reachable, `503` if not.

`PrismaService` connects to Postgres via the `@prisma/adapter-pg` driver adapter
(Prisma 7, Rust-free client); `DATABASE_URL` comes from `ConfigService`.

## Running

```bash
pnpm --filter @ffai/api dev     # nest start --watch (recompilation via SWC)
pnpm --filter @ffai/api build   # nest build → dist/
pnpm --filter @ffai/api start   # node dist/main.js
pnpm --filter @ffai/api test    # jest (healthcheck integration test)
```

`DATABASE_URL` comes from the root `.env` (see `.env.example`); on Railway —
from real environment variables. Port — `PORT` (defaults to `3000`).

CORS is scoped to the browser client's origin: `WEB_ORIGIN` (defaults to
`http://localhost:3001`, where `@ffai/web` runs locally). On Railway/prod set
the deployed web address — don't hardcode it.

## Tooling (carry-overs closed from F0.2)

- **tsconfig:** on top of `@ffai/config/tsconfig/base.json` we add `experimentalDecorators`
  / `emitDecoratorMetadata` and `module: nodenext` (resolves as CommonJS — the package has no
  `"type": "module"`). The actual build is done by SWC (`.swcrc`); `tsc` is typecheck only.
- **`@/` alias at runtime:** SWC rewrites `@/*` into relative paths at build time
  (`jsc.baseUrl` + `jsc.paths`); in tests — via Jest's `moduleNameMapper`.
- **Type-aware ESLint:** `@ffai/config/eslint/type-checked` is enabled with
  `no-floating-promises` / `no-misused-promises` — critical for atomic mutations.
