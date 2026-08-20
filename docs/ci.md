# CI gate (F0.9 — GitHub Actions)

Mandatory gate on every PR: **lint · format:check · typecheck · contract drift · build ·
unit · integration · e2e**. Workflow —
[.github/workflows/ci.yml](../.github/workflows/ci.yml). Every check that consumes no other
check's output is its own job, so they all start at once; `gate` is the single status check
that aggregates them and the only one worth requiring on `main`:

```text
secrets      ─┐
static       ─┤
build        ─┤
unit         ─┼─→ gate
integration  ─┤
preflight → e2e
preflight → sonar   (reports its own status; not aggregated by gate yet)
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
- **The contract drift check runs the same script as the pre-commit hook** — `codegen.sh`
  (F1.5), the hook in `stage` mode and the `static` job in `check` mode. Both regenerate
  `apps/api/openapi.json` and `packages/api-client/src/generated`; the hook adds the result
  to the commit, CI fails if regenerating changed anything. That is the same shape as the
  secret scan and for the same reason: the hook is convenience, the job is the guarantee — a
  commit made with `--no-verify`, from a machine without husky or through GitHub's web editor
  lands here instead. The one asymmetry worth knowing is that a generator reads the working
  tree while a commit is built from the index: on a partial commit the hook would otherwise
  stage a contract the commit's own sources do not produce, so when the contract moved and
  its sources are not all staged it refuses the commit instead of guessing — the same failure
  CI would report, an hour earlier. The check compares with `git status` rather than
  `git diff --exit-code`: `diff` only compares tracked content, so a file the generator has
  only just started emitting — what a generator bump does — would slip past it untracked and
  unnoticed. The step sits last in `static` on purpose: `pnpm typecheck` above already pulled
  the whole chain, so turbo replays it from cache and the check itself costs a `git status`.
- **`static` lints one directory that is not a workspace** — `pnpm lint:hooks` (`eslint .claude`).
  `pnpm lint` is `turbo run lint` and only reaches workspaces, so a lint error in the agent
  setup passes it. The pre-commit hook catches one through lint-staged, but by the same
  reasoning as the secret scan the hook is convenience and the job is the guarantee.
- **`unit` carries one test suite that is not the app's** — `pnpm test:hooks`
  (`.claude/hooks/hooks.test.sh`, F1.9). The guard hooks are what stop an agent from skipping
  the secret scan or running a migration against dev, they belong to no workspace, so
  `turbo run test:unit` never sees them, and a mistake in either is silent — the refusal that
  never fires looks exactly like the command that was fine. It needs no database and no
  secrets, so it rides along in `unit` rather than paying for a job of its own. Levels and
  prerequisites: [testing.md](testing.md).
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
- **The contract chain runs inside the graph (F1.4):** `@rondo/api-client` is generated from
  `apps/api/openapi.json`, which is generated from the built api, so `typecheck` and the
  client's own tests pull `@rondo/api#build` → `@rondo/api#openapi` → `codegen` behind them.
  Nothing in CI invokes those steps by name, and generation needs no database — the generator
  boots the app in Nest's preview mode, which constructs no providers. **`build` deliberately
  does not pull that chain:** the generated files are committed, so the web image builds from
  them instead of compiling the whole API to produce them again. A stale commit of those files
  is what the drift check above is for, not a rebuild.
- **Turborepo strict env mode:** turbo passes a task only the variables declared
  in that task's `env` in `turbo.json` (plus `globalPassThroughEnv`). A new environment
  variable for a test/server → declare it there too, otherwise everything is green
  locally with `.env`, but in CI the variable never reaches the process.
- **E2E**: Playwright builds and starts api and web itself (`reuseExistingServer` is off
  in CI). The CI reporter is `github` (annotations right in the PR); on failure, traces
  (`apps/web/test-results`) are uploaded as the `playwright-traces` artifact.
- **E2E run against a production build of web** (F1.11) — `next build` + `next start`, not
  `next dev`, because dev mode is a different application and a green suite against it proved
  nothing about what ships. That means this job pays for a `next build`, and **it cannot
  borrow the one from the `build` job**: that job builds without the Clerk keys by design,
  `NEXT_PUBLIC_*` are inlined into the bundle, so its output would serve nothing. So the two
  stay independent — as everywhere else in this gate — and the second build is paid for with
  a cache of `apps/web/.next/cache` instead, restored and saved by explicit steps for the same
  reason as the browser cache. The publishable Clerk key therefore has to reach the build, and
  `apps/web/check-public-env.mjs` fails the job when it does not, rather than letting a bundle
  nobody can sign in to be tested.
- **Installing the browser is the slowest step in that job, and it has two halves.** The
  browser binaries are cached on the resolved Playwright version, so a hit skips the CDN
  download. The cache is saved by an explicit step rather than by `actions/cache`'s post step,
  which GitHub skips when the job fails — otherwise a run of failing tests, which is exactly
  when the loop is tightest, would never populate it. The system packages cannot be cached — they are apt packages and each run gets a
  fresh VM — so the system dependencies are installed on every run — `install --with-deps`
  on a cache miss, `install-deps` on a hit — and that is not ceremony: nine of the libraries
  Chromium needs are missing from the runner image. That apt half is also the one that fails:
  it has hung against an unreachable Ubuntu mirror for a job's entire 25-minute budget. Hence
  the per-attempt `timeout`, the single retry and the step's own `timeout-minutes` — a stuck
  mirror should cost minutes and say so, not consume the job and report a bare cancellation.
- **Why that retry kills `apt-get` before it runs.** `timeout` signals only the process it
  started, and here that is the head of a chain (pnpm → node → apt-get). The first version of
  this retry killed the head and left apt-get holding `/var/lib/apt/lists/lock`, so the second
  attempt died in one second with "Could not get lock" — the retry existed and could not
  possibly work. The orphan is cleared between attempts for that reason, and it is the sort of
  thing that only shows up in a log: both attempts are announced as warnings so the next
  failure is readable.
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
- **`sonar` — SonarQube Cloud analysis** (F1.12): cognitive complexity, cross-workspace
  duplication, security hotspots, test coverage and a quality gate on **new** code — the
  signals ESLint, Prettier and `strict` TypeScript don't carry. Scanner configuration
  (project key, sources, exclusions, lcov paths) lives in
  [sonar-project.properties](../sonar-project.properties); the analysis is CI-based because
  Sonar's automatic analysis does not support monorepos. The job checks out the full
  history (`fetch-depth: 0` — Sonar attributes issues to new code via blame) and provisions
  its own JRE, so it does not depend on the runner's Java. `SONAR_TOKEN` lives in **both**
  secret stores — Actions and Dependabot — so unlike e2e (whose Clerk keys are Actions-only)
  the analysis also runs on Dependabot PRs; fork PRs see neither store, so `sonar` branches
  on the same `preflight` mechanism as e2e
  (`if: needs.preflight.outputs.has_sonar_token == 'true'`). **The job is deliberately not
  in the gate's `needs` yet**: the switch-on order is to watch it stay green and quiet
  across several PRs, and only then promote it into `gate` — the reverse order means a red
  gate on the first PR because of tuning, not code.
- **Coverage for Sonar**: the jest configs keep coverage always on, so the plain test
  commands (`pnpm test:unit`, `pnpm test:integration`) emit `coverage/lcov.info` in each
  tested workspace — the same command produces the same artefacts locally and in CI, and
  the lcov reporter
  rewrites paths to be repo-root-relative (the scanner runs at the repo root and could not
  resolve workspace-relative `src/…` otherwise). The `sonar` job re-runs the unit and
  integration tests itself (with its own Postgres service) to produce those files, rather
  than receiving them from the `unit`/`integration` jobs as artifacts — the same trade as
  reinstalling dependencies everywhere: a re-run keeps every job self-contained, while
  artifact hand-off couples jobs and silently flattens single-file artifact paths.
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

Like every other repository setting, this is not in code: the ruleset and **Allow auto-merge**
(Settings → General, needed by the workflow below) both have to be recreated by hand if the
repository moves.

## Dependabot: patch and minor merge themselves

[.github/workflows/dependabot-auto-merge.yml](../.github/workflows/dependabot-auto-merge.yml)
turns on GitHub's auto-merge for Dependabot pull requests whose highest bump is
`version-update:semver-patch` or `semver-minor`. Majors are left for a human to read.

The distinction worth keeping straight: **the workflow merges nothing**. Auto-merge means
"merge this once the branch rules are satisfied", so `gate` still decides — a red one leaves
the PR open exactly as before, and this changes who presses the button, not what is allowed
through. It exists because with zero required approvals a green Dependabot PR is merge-able
and then just sits there, which is how five of them pile up.

Details that are not obvious from the file:

- **The semver step comes from `dependabot/fetch-metadata`**, which reads the metadata
  Dependabot writes into the commit — the PR title is prose and is not parsed. The action
  also validates the author and the commit signature, so a pull request that merely looks
  like Dependabot's fails the step instead of being merged.
- **`update-type` is the highest bump in the PR.** That is what makes this safe for the
  grouped updates in [dependabot.yml](../.github/dependabot.yml): a group of patches and
  minors reports `semver-minor` and merges; one major anywhere in a group reports
  `semver-major` and holds the entire group. The `actions` group has no `update-types`
  filter, so it is the one that will occasionally stop on a major and need a look.
- **A Dependabot run gets a read-only `GITHUB_TOKEN`** unless the workflow declares
  otherwise; `contents: write` + `pull-requests: write` is the minimum `gh pr merge --auto`
  needs, and the most that file is granted.
- **They merge one at a time.** The ruleset is `strict`, so after one PR lands the rest are
  out of date and their green `gate` no longer counts. Dependabot rebases its own pull
  requests by default, which re-runs the gate and lets auto-merge fire again — the queue
  drains by itself, just not instantly. (It stops rebasing a PR left unmerged for 30 days;
  `@dependabot rebase` in a comment restarts it.)
- **`e2e` is skipped on these runs** — the Clerk secrets are hidden from Dependabot, and
  `gate` counts `skipped` as passing. So an auto-merged dependency bump was proven by
  everything except the browser scenarios. That is the deliberate trade behind the
  `preflight` mechanism above, and the reason `build` exists as its own job: it is what
  catches a dependency that breaks the toolchain when Playwright is not there to.
