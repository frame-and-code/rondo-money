# CI gate (F0.9 — GitHub Actions)

Mandatory gate on every PR: **lint · format:check · typecheck · build · unit · integration ·
e2e**. Workflow — [.github/workflows/ci.yml](../.github/workflows/ci.yml). Every check that
consumes no other check's output is its own job, so they all start at once; `gate` is the
single status check that aggregates them and the only one worth requiring on `main`:

```text
secrets      ─┐
static       ─┤
build        ─┤
unit         ─┼─→ gate
integration  ─┤
preflight → e2e
```

`gate` runs with `if: always()` and fails unless every job it needs ended in `success` or
`skipped` — without `always()` a red dependency would leave the gate itself skipped, which
reads as "not run" rather than "failed". It carries no display name on purpose, so the
status check keeps the exact id `gate` that branch rules point at.

## How it works

- Every step uses the same root commands as locally: `pnpm lint`, `pnpm typecheck`,
  `pnpm test:unit` etc. (see [testing.md](testing.md)). CI doesn't invent its own way
  of running things — if the gate is red, the same failure reproduces locally.
- **`secrets` runs the same script as the pre-commit hook** — `secret-scan.sh`, in its
  `history` mode (`pnpm scan:secrets` locally). One script, two callers, so the local and CI
  scans cannot drift apart; CI only adds the install step, and puts gitleaks on `PATH` so the
  script finds it exactly the way it does on a laptop. It scans the **whole history**, not
  the diff: a rebase or a force push can carry an old secret into a new commit range, where
  a diff-only scan sees nothing. Repeating the hook is the point — the hook is skipped by
  `--no-verify`, by any machine without husky, and by GitHub's web editor, while this job
  cannot be bypassed. The gitleaks version and the checksum of its release archive are pinned
  in the workflow (the rule set changes between versions, so an unpinned scanner makes the
  gate a moving target); the official `gitleaks-action` is deliberately not used — it needs
  a paid licence for repositories owned by an organisation, while the binary itself is free.
- Each job reinstalls dependencies — that is the price of running them in parallel, and a
  warm pnpm store cache keeps it far below the time saved. The setup steps (checkout →
  pnpm → node → install) are repeated verbatim rather than extracted into a local
  composite action: Dependabot scans `.github/workflows`, so an action under
  `.github/actions/` would keep its pinned SHA forever without anyone noticing.
- **Postgres** runs as a service container (`postgres:18` — the same image as in
  `docker-compose.yml`) in the two jobs that need a database, `integration` and `e2e`;
  each applies migrations first: `pnpm --filter @rondo/db run db:deploy`
  (`prisma migrate deploy`).
- DB credentials are declared once in the workflow env (`POSTGRES_*`): they configure
  the service containers, and `DATABASE_URL` is assembled from them in a step of each
  DB-backed job (into `$GITHUB_ENV`) — the `env` context is unavailable in workflow- and
  job-level `env`. There are no `.env` files in CI — `ConfigModule` (api) and
  `prisma.config.ts` (db) read `process.env`.
- **`build` is not covered by typecheck:** `tsc --noEmit` only reads the sources, while
  `nest build` and `next build` also exercise the toolchain around them. A TypeScript bump
  once passed the whole gate while leaving `apps/api` unbuildable, because the only thing
  building the API was Playwright — which is skipped whenever the Clerk secrets are absent,
  i.e. on every Dependabot pull request.
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
  is behind auth, so without them not a single page serves. GitHub hides those secrets from
  pull requests **from forks** and from **Dependabot-triggered** runs, and the `secrets`
  context can be read in neither a job `if` nor a step `if`. So the answer is materialised
  by a tiny `preflight` job as an output, and `e2e` branches on it
  (`if: needs.preflight.outputs.has_clerk_keys == 'true'`); the rest of the gate still
  runs, and the step summary spells out why e2e was skipped. Skipping the whole job rather
  than each of its steps is the point: a job that reports success while silently doing
  nothing is exactly what once hid a broken build. When the keys _are_ present but broken,
  e2e fails loudly — a green gate must never mean "auth was never tested".
- Runs on PRs and on pushes to `main`; a repeated push to the same branch cancels
  the previous run (`concurrency`).

## Branch protection on `main`

A branch ruleset targets the default branch (GitHub → Settings → Rules → Rulesets). It only
became configurable when the repository went public in F1.10 — branch rules are a paid
feature on a private repository, and the API answered 403 to every attempt before that. What
it enforces:

- **Require a pull request before merging** — zero required approvals, there is one
  maintainer;
- **Require status checks to pass** → `gate`, and only `gate`: it aggregates every other
  job and exists for precisely this;
- **Require branches to be up to date before merging** (`strict`) — a green `gate` only
  proves the branch passed against the base it was built on, not against today's `main`.
  Two independently green PRs can still merge into a red `main`, and a green `main` ships
  to dev on its own (see [deploy-railway.md](deploy-railway.md));
- **Block force pushes**, and block deletion of the branch.

**The repository admin role is on the bypass list, so none of this constrains the
maintainer.** With one person holding the keys, being locked out of your own repository on a
Sunday evening is the worse failure mode. Read the rules accordingly: they are a guardrail
against slips and against everyone who is not an admin, not a wall — a direct push to `main`
from an admin account still goes through. The trade-off is worth revisiting the moment a
second person gets write access.

Like every other repository setting, this is not in code: it has to be recreated by hand if
the repository moves.
