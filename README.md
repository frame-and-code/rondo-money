# Rondo Money

Zero-based budgeting: give every unit of money a job before you spend it. Envelope
method, computed on the fly, no bank sync.

Monorepo on **Turborepo + pnpm**, published by Frame & Code.

## ⚠️ Status: pre-alpha — do not put real data here

There are no releases. The database schema changes between phases **without backwards
compatibility**, and migrations are written for a schema that is still being designed.
Nothing here holds money, but it will hold a record of yours, and that record can be lost
on any update.

Run it to read the code, to try the idea, or to hack on it. Do not make it the only place
your budget exists.

Current stage: **phase 1, authentication, is done.** Sign-in, per-user isolation and the
typed API contract work end to end, on top of phase 0 (infrastructure, CI, deployment).
Phase 2, the single write point and the change log, is next. The budgeting model itself is
not built yet.

## What it is

A personal budgeting app in the YNAB tradition: money is distributed into category
envelopes for the month _before_ it is spent, unspent remainders roll forward, and
balances, "available" amounts and net worth are never stored — they are computed from
transactions and assignments on demand.

**Transactions are entered by hand, on purpose.** There is no bank synchronisation and no
automatic import, and that is a product decision rather than a missing feature: the moment
you write a transaction down is the moment you notice it. Automation optimises the
completeness of a report; manual entry optimises attention.

## Licence

**AGPL-3.0-only** — see [LICENSE](LICENSE). You may run, study, modify and redistribute
this code, including as a hosted service, provided your version stays under the same
licence and its users can get its source.

The **name and logo are not covered by the licence** — see [NOTICE](NOTICE). Fork the
code freely; give your fork its own name.

## Contributions and support

Pull requests are **not accepted**: creating one is restricted to collaborators, and
anything that does reach the repository is closed automatically. Issues are disabled. This
is deliberate — the reasoning is in [CONTRIBUTING.md](CONTRIBUTING.md).

Security problems are the one open channel: report them privately through the
[Security tab](../../security/advisories/new), see [SECURITY.md](SECURITY.md).

Self-hosting is supported by the community, not by the author. There are no guarantees,
no support obligation, and no promise that an upgrade will preserve your data.

## Requirements

- Node.js 26 (see `.nvmrc`; the same version runs in CI and in the Docker images)
- pnpm 11 (`corepack enable` picks up the version from the `packageManager` field)
- Docker (Desktop / Engine / OrbStack) — for the local database
- A [Clerk](https://clerk.com) account — the web app does not start without its keys
- [gitleaks](https://github.com/gitleaks/gitleaks) — only if you intend to commit: the
  pre-commit hook scans the staged changes for secrets and refuses to run without it
  (`brew install gitleaks`). It is a binary rather than a pinned dependency, so its rule
  set travels with whatever version you install; developed against 8.30.1

## Structure

```text
apps/
  web/        # frontend (Next.js App Router) — skeleton in F0.5
  api/        # backend (NestJS REST) — skeleton in F0.4
packages/
  db/         # Prisma schema and migrations — F0.4
  types/      # shared DTOs; money as BigInt (minor units) — from day one
  api-client/ # typed API client, generated from the API's OpenAPI spec — F1.4
  config/     # shared configs (eslint / tsconfig / prettier) — F0.2
  ui/         # shared UI components (shadcn/ui) — F0.6
.claude/      # agent setup: rules, commands, skills, agents, hooks, permissions — F1.9
```

## Written with an agent

Most of this code is written by Claude Code, so the project's conventions are checked in
rather than remembered: [`CLAUDE.md`](CLAUDE.md) and [`.claude/`](.claude/README.md) hold
the rules that load into every session, the workflow commands, and the hooks that block
what must never happen — a push to `main`, a commit that skips the secret scan, a
destructive migration against a non-local database. If you fork this repository and work
in it by hand, none of it gets in your way; if you work in it with an agent, it is the
part that keeps the result consistent.

## Running locally

```bash
pnpm install      # install all workspaces
pnpm dev          # run apps in dev mode
pnpm build        # build all packages
pnpm lint         # linting
pnpm test         # tests
pnpm scan:secrets # scan the whole git history for secrets (gitleaks)
```

Commands run through Turborepo and are parallelized across workspaces.

### Configuration — with your own keys

Three files are needed, and none of them is in git:

```bash
cp .env.example .env    # DATABASE_URL and WEB_ORIGIN; defaults match docker-compose.yml
```

Then create `apps/web/.env.local` and `apps/api/.env.local` from the `.env.local.tpl` next
to each ([web](apps/web/.env.local.tpl), [api](apps/api/.env.local.tpl)) and fill in **your
own** Clerk keys, taken from `dashboard.clerk.com` → API Keys of a development instance.
Those templates are the full env contract of each app; nothing in this repository is tied
to a particular Clerk or Railway instance. Without its key the API refuses to start — it
verifies every request's token (see [`apps/api`](apps/api/README.md)).

The `{{ op://... }}` placeholders in the template are 1Password references used by the
author's own `pnpm env:setup`. Without the 1Password CLI, replace them with your keys by
hand — that is the expected path for everyone else.

### Database

PostgreSQL comes up with a single Docker Compose command:

```bash
docker compose up -d   # start PostgreSQL in the background
docker compose down    # stop (data persists in the volume)
```

The image version (`postgres:18`) matches the deployment. Data lives in a Docker volume
and survives container restarts.

The credentials in `.env.example` are applied by Postgres **only when it initialises an
empty data directory**. If you ran an earlier version of this project, the volume still
holds the old role and you will get `password authentication failed` with no further hint.
Recreate it once — the local database holds nothing but test data:

```bash
docker compose down -v && docker compose up -d && pnpm db:migrate
```

```bash
pnpm db:generate             # generate the Prisma client (also on postinstall)
pnpm db:migrate              # apply migrations to the local DB (Postgres must be running)
pnpm --filter @rondo/api dev # start the API; GET http://localhost:3000/health → 200
```

`/health` is the only endpoint open to an anonymous caller; everything else needs a Clerk
session token, and the API will not start without a Clerk key in `apps/api/.env.local`.
Outside production the API also serves its own documentation at
[`/docs`](http://localhost:3000/docs), generated from the same OpenAPI spec the typed client
is built from.

`DATABASE_URL` is read from the root `.env` (see `.env.example`). Details —
in [`apps/api`](apps/api/README.md) and [`packages/db`](packages/db/README.md).

### Web

```bash
pnpm --filter @rondo/web dev   # http://localhost:3001 (redirects to /sign-in)
```

Without Clerk keys in `apps/web/.env.local` every request fails. Where to get them and the
full env contract — in [`apps/web`](apps/web/README.md).

## Tests

Three levels — unit / integration / e2e — plus the agent guard hooks, which are not a level
of the app at all; tests are written together with the feature:

```bash
pnpm test               # all levels (turbo run test)
pnpm test:unit          # unit (Jest + fast-check)
pnpm test:integration   # API ↔ Postgres (needs docker compose up -d)
pnpm test:e2e           # Playwright: browser → web → api → Postgres
pnpm test:hooks         # the agent guard hooks in .claude/hooks (bash; no DB, no keys)
pnpm lint:hooks         # lint .claude, which no turbo task reaches
```

Once before e2e: `pnpm --filter @rondo/web exec playwright install chromium`.
How to add tests to a new feature — in [`docs/testing.md`](docs/testing.md).
