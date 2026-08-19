# Agent setup (F1.9)

Most of this codebase is written by an agent, so the project's rules have to live in the
agent's context by default rather than in the author's head. That is what this directory
is: checked-in configuration Claude Code loads automatically.

Everything here is organised by **when it reaches the model**, because that decides what
each kind of file may cost and what it may contain:

| Layer                  | Loaded                            | Contains                                          |
| ---------------------- | --------------------------------- | ------------------------------------------------- |
| `CLAUDE.md` + `rules/` | every turn, via `@` imports       | short imperatives — what must and must not happen |
| `commands/`            | when the user types `/name`       | workflow entry points                             |
| `skills/`              | when a task matches one           | how a recurring piece of work is actually done    |
| `hooks/`               | by the runtime, deterministically | guarantees; not LLM, cannot be talked out of      |
| `settings.json`        | at start                          | which tools may run without asking                |
| `config/`              | when an agent goes looking        | pointers to external truth                        |

A rule is a sentence you must not break. A hook is a rule that cannot be broken. Anything
that must hold every time belongs in a hook or in `settings.json` — not only in prose.

One layer lives outside this directory: [`apps/web/AGENTS.md`](../apps/web/AGENTS.md), loaded
through the one-line `apps/web/CLAUDE.md` when work happens in that workspace. It exists
because **Next 16 writes it itself**: `next dev` detects a coding agent and inserts a managed
block (`writeAgentFiles` in `node_modules/next/dist/server/lib/generate-agent-files.js`). Rather
than fight a dependency that writes into the agent's context, the file was made ours — Next
maintains only what is between its markers, the rest is the workspace's own guidance, and any
change Next makes shows up in a diff.

## Rules (`rules/`)

All seven are imported by [`CLAUDE.md`](../CLAUDE.md) and are therefore in context on every
turn. They stay short deliberately: detail belongs in `docs/`, and the rule links to it.

| Rule                                             | Holds                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [`model-integrity.md`](rules/model-integrity.md) | do not invent version-dependent detail; open questions go to the user; report what actually happened      |
| [`architecture.md`](rules/architecture.md)       | layer boundaries (ADR-002), no derived state, one write point (ADR-001), money/dates, invariant 5.5       |
| [`security.md`](rules/security.md)               | tenant isolation without RLS (ADR-005), secrets in a public repository (ADR-003), destructive DB commands |
| [`code-quality.md`](rules/code-quality.md)       | types, errors, comments, dead code, dependencies                                                          |
| [`specs.md`](rules/specs.md)                     | Notion as the decision memory; repository docs corrected in the same PR                                   |
| [`testing.md`](rules/testing.md)                 | tests written with the feature; invariant 5.5 and cross-tenant tests are mandatory                        |
| [`communication.md`](rules/communication.md)     | English in git, Russian in chat; git is the user's call; branch/commit/PR wording                         |

## Skills (`skills/`)

| Skill                                                         | Use when                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`add-a-domain-module/`](skills/add-a-domain-module/SKILL.md) | adding an API module that reads or writes a domain table (the F1.6 `user-settings` shape) |

A skill is grounded in code that exists: every step names a real file to copy from, so it
cannot drift into describing an API nobody wrote.

## Commands (`commands/`)

| Command              | Does                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `/dev`               | brings up Postgres, migrations, api and web, and reports what is actually running              |
| `/check`             | the CI gate locally: lint, typecheck, format, build, tests, secret scan, contract drift        |
| `/plan <F1.x>`       | reads the ticket and returns an ordered, file-scoped plan; writes no code                      |
| `/grill-me <task>`   | interviews until the scope is shared, then hands off to `/plan`                                |
| `/sync-docs`         | sweeps the documentation the change touched and corrects what went stale                       |
| `/phase-done <F1.x>` | verifies the ticket's Acceptance Criteria one by one, runs the gate, drafts the PR text        |
| `/babysit-pr [#N]`   | polls CI, Sonar and the AI reviewers on an open PR, fixes what they find, stops at merge-ready |

## Hooks (`hooks/`)

Wired in [`settings.json`](settings.json). Blocking hooks exit 2 and the reason goes back to
the agent; advisory hooks exit 0 and their output becomes context. They parse their JSON
input with `node`, which this repository already requires — no extra prerequisite.

| Hook                                                         | Event                  | Behaviour                                                                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`guard-bash.sh`](hooks/guard-bash.sh)                       | `PreToolUse` :: `Bash` | **blocks** npm/yarn, every way round the secret scan (`--no-verify`, `HUSKY=0`, `core.hooksPath`), pushes to `main`, reckless `rm -rf` — seeing through wrappers like `command`, `env` and `sudo` |
| [`guard-db.sh`](hooks/guard-db.sh)                           | `PreToolUse` :: `Bash` | **blocks** `prisma migrate` / `db push` / `DROP` / `TRUNCATE` unless `DATABASE_URL` points at the local database                                                                                  |
| [`session-start-context.sh`](hooks/session-start-context.sh) | `SessionStart`         | prints branch, uncommitted count, last five commits; warns when the branch is `main`                                                                                                              |
| [`stop-docs-drift.sh`](hooks/stop-docs-drift.sh)             | `Stop`                 | when the session changed code but no `.md`, names the documents worth checking                                                                                                                    |
| [`stop-scoping-drift.sh`](hooks/stop-scoping-drift.sh)       | `Stop`                 | when `schema.prisma` changed but the scoped-model registry did not, lists what a new user-owned table needs (registry, migration, cross-tenant test, `@map`)                                      |

`stop-scoping-drift.sh` deliberately does not parse the schema: the guarantee that a
user-owned model is registered is a unit test (`apps/api/test/scoped-models.spec.ts`), which
runs for everyone in CI. Re-implementing its logic in bash would drift from it silently, and a
check that quietly stops matching is worse than none — the same reasoning by which ADR-005
rejected "extension only, no rules for raw SQL".

The third guarantee is not a hook: `git commit`, `git push` and branch creation are
deliberately **absent** from the allow list in `settings.json`, so every one of them
prompts. That is the mechanical twin of the top rule in `CLAUDE.md` — and the reason a
guard hook for them would be redundant.

Neither layer is a sandbox, and `guard-bash.sh` says so in its own header: they refuse an
agent's shortcuts, not a determined bypass. What they buy is that the obvious way round a
rule fails loudly.

## Config (`config/`)

[`external-docs.json`](config/external-docs.json) — the external documentation this
project's decisions actually depend on (Prisma extension boundaries, the ESLint rules that
enforce ADR-005, Clerk JWT and revoked sessions, ISO 4217 exponents, the Railway
config-as-code keys behind `apps/*/railway.json`). Each entry says why we go there, because
a link list nobody can justify becomes a link list nobody opens.

## Not here yet

Deliberate, not missing. Each arrives with the phase that gives it something true to
describe — a skill grounded in code that does not exist yet would be fiction:

- more `skills/` — `add-a-mutation`, `testing-patterns` (F2.2); `aggregate-query`,
  `budget-invariant` (F4.2);
- `agents/` — `migration-reviewer` (F3.1), `invariant-debugger` (F4.2).

Every phase carries the same DoD item: a repeatable pattern it introduced is captured here
in the same PR.

## Extending

- **New rule:** add `rules/<name>.md`, keep it to imperatives, and import it from
  `CLAUDE.md` — an unimported rule is a file nobody reads.
- **New command:** add `commands/<name>.md` with `description` (and `argument-hint` when it
  takes one). Give it an explicit output shape; that is what makes commands composable.
- **New hook:** add the script, `chmod 755`, wire it in `settings.json`. Decide first
  whether it blocks (exit 2) or advises (exit 0) — a blocking hook that fires on a false
  positive is worse than no hook.
- `settings.local.json` holds personal permission grants and is git-ignored.
- Update this file in the same change. It is documentation like any other: a table here
  that no longer matches the directory is exactly the drift `rules/specs.md` forbids.
