# CI gate (F0.9 — GitHub Actions)

Mandatory gate on every PR: **lint → format:check → typecheck → tests**
(unit → integration → e2e). Workflow — [.github/workflows/ci.yml](../.github/workflows/ci.yml),
a single `gate` job, steps run strictly in sequence — a red step fails the whole gate.

## How it works

- Every step uses the same root commands as locally: `pnpm lint`, `pnpm typecheck`,
  `pnpm test:unit` etc. (see [testing.md](testing.md)). CI doesn't invent its own way
  of running things — if the gate is red, the same failure reproduces locally.
- **Postgres** runs as a service container (`postgres:18` — the same image as in
  `docker-compose.yml`); migrations run before integration:
  `pnpm --filter @ffai/db run db:deploy` (`prisma migrate deploy`).
- DB credentials are declared once in the workflow env (`POSTGRES_*`): they configure
  the service container, and `DATABASE_URL` is assembled from them in the first step
  (into `$GITHUB_ENV`). There are no `.env` files in CI — `ConfigModule` (api) and
  `prisma.config.ts` (db) read `process.env`.
- **Turborepo strict env mode:** turbo passes a task only the variables declared
  in that task's `env` in `turbo.json` (plus `globalPassThroughEnv`). A new environment
  variable for a test/server → declare it there too, otherwise everything is green
  locally with `.env`, but in CI the variable never reaches the process.
- **E2E**: Playwright builds and starts api and web itself (`reuseExistingServer` is off
  in CI); the browser is installed by the `playwright install --with-deps chromium` step.
  The CI reporter is `github` (annotations right in the PR); on failure, traces
  (`apps/web/test-results`) are uploaded as the `playwright-traces` artifact.
- **Clerk keys in e2e** (F1.1): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
  come from repository secrets (GitHub → Settings → Secrets → Actions) — the whole web app
  is behind auth, so without them not a single page serves. GitHub does not expose secrets
  to pull requests **from forks**, so the step is gated on the job-level `HAS_CLERK_KEYS`
  boolean and simply doesn't run there (the rest of the gate still does). The gate is
  computed in job `env` rather than read straight from `secrets` in the step's `if`:
  the `secrets` context is forbidden in `if` and using it there makes GitHub reject the
  whole workflow at parse time. When the keys _are_ present but broken, e2e fails loudly
  instead of skipping — a green gate must never mean "auth was never tested".
- Runs on PRs and on pushes to `main`; a repeated push to the same branch cancels
  the previous run (`concurrency`).

## Branch protection on `main`

Merging into `main` — only via a PR with a green `gate` check (required status check,
`strict: true` — the branch must be up to date with `main`; applies to admins too).
A red gate blocks the merge; direct pushes to `main` are closed off.

The setup lives in GitHub → Settings → Branches (or `gh api .../branches/main/protection`);
it's not in code — reconfigure manually if the repository moves.
