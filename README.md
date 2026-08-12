# Fin Flow AI

Fin Flow AI monorepo on **Turborepo + pnpm**.

Current stage: **Phase 0 → F0.8 (test harness)**. The remaining Phase 0 features
(CI, deploy) land in F0.9–F0.10.

## Requirements

- Node.js >= 20 (22 recommended — see `.nvmrc`)
- pnpm 11 (`corepack enable` picks up the version from the `packageManager` field)
- Docker (Desktop / Engine) — for the local DB

## Structure

```text
apps/
  web/        # frontend (Next.js App Router) — skeleton in F0.5
  api/        # backend (NestJS REST) — skeleton in F0.4
packages/
  db/         # Prisma schema and migrations — F0.4
  types/      # shared DTOs; money as BigInt (minor units) — from day one
  config/     # shared configs (eslint / tsconfig / prettier) — F0.2
  ui/         # shared UI components (shadcn/ui) — F0.6
```

## Running locally

```bash
pnpm install      # install all workspaces
pnpm dev          # run apps in dev mode
pnpm build        # build all packages
pnpm lint         # linting
pnpm test         # tests
```

Commands run through Turborepo and are parallelized across workspaces.

## Database (local)

PostgreSQL comes up with a single Docker Compose command:

```bash
pnpm env:setup         # once: .env + apps/web/.env.local (needs the 1Password CLI, see setup-env.sh)
docker compose up -d   # start PostgreSQL in the background
docker compose down    # stop (data persists in the volume)
```

Without 1Password: `cp .env.example .env`, and create `apps/web/.env.local` by hand
from [apps/web/.env.local.tpl](apps/web/.env.local.tpl).

The image version (`postgres:18`) matches production on Railway. Data lives
in a Docker volume and survives container restarts.

### Migrations and API (F0.4)

```bash
pnpm db:generate            # generate the Prisma client (also on postinstall)
pnpm db:migrate             # apply migrations to the local DB (Postgres must be running)
pnpm --filter @ffai/api dev # start the API; GET http://localhost:3000/health → 200
```

`DATABASE_URL` is loaded from the root `.env` (see `.env.example`). Details —
in [`apps/api`](apps/api/README.md) and [`packages/db`](packages/db/README.md).

### Web (F0.5, auth — F1.1)

```bash
pnpm --filter @ffai/web dev   # http://localhost:3001 (redirects to /sign-in)
```

The web app requires Clerk keys in `apps/web/.env.local` (created by `pnpm env:setup`
above) — without them every request fails. Where to get the keys and the full env
contract — in [`apps/web`](apps/web/README.md).

## Tests (F0.8)

Three levels — unit / integration / e2e; tests are written together with the feature:

```bash
pnpm test               # all levels (turbo run test)
pnpm test:unit          # unit (Jest + fast-check)
pnpm test:integration   # API ↔ Postgres (needs docker compose up -d)
pnpm test:e2e           # Playwright: browser → web → api → Postgres
```

Once before e2e: `pnpm --filter @ffai/web exec playwright install chromium`.
How to add tests to a new feature — in [`docs/testing.md`](docs/testing.md).
