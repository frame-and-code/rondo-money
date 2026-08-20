# Agent setup (F1.9)

Most of this codebase is written by an agent, so the project's rules have to live in the
agent's context by default rather than in the author's head. That is what this directory
is: checked-in configuration Claude Code loads automatically.

Everything here is organised by **when it reaches the model**, because that decides what
each kind of file may cost and what it may contain:

| Layer                  | Loaded                            | Contains                                           |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| `CLAUDE.md` + `rules/` | every turn, via `@` imports       | short imperatives — what must and must not happen  |
| `commands/`            | when the user types `/name`       | workflow entry points                              |
| `skills/`              | when a task matches one           | how a recurring piece of work is actually done     |
| `agents/`              | when one is spawned               | a reviewer's brief, read with no session history   |
| `hooks/`               | by the runtime, deterministically | guarantees; not LLM, cannot be talked out of       |
| `settings.json`        | at start                          | which tools may run without asking, and which must |
| `config/`              | when an agent goes looking        | pointers to external truth                         |

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

| Skill                                                         | Use when                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`add-a-domain-module/`](skills/add-a-domain-module/SKILL.md) | adding an API module that **reads** a domain table (the F1.6 `user-settings` shape); writes are F2.2 |

A skill is grounded in code that exists: every step names a real file to copy from, so it
cannot drift into describing an API nobody wrote.

## Agents (`agents/`)

| Agent                                     | Use when                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`pr-reviewer.md`](agents/pr-reviewer.md) | reviewing a change against this project's invariants — spawned per dimension by [`/review`](commands/review.md) |

An agent exists here for one reason: **a subagent starts with no conversation history.** It
receives `CLAUDE.md` and the rules, and nothing of the session that spawned it — so it reads
a change the way a reviewer on the PR does, rather than the way its author remembers meaning
it. That also keeps the reading out of the main window: what comes back is findings, not
file dumps. `/review` fans several out in parallel and then spawns a second wave to try to
refute what the first found, because a plausible-but-wrong finding costs the reader exactly
as much as a real one.

## Commands (`commands/`)

| Command                | Does                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dev`                 | brings up Postgres, migrations, api and web, and reports what is actually running                                                                                               |
| `/check`               | the CI gate locally: lint, typecheck, format, build, tests, secret scan, contract drift                                                                                         |
| `/plan <F1.x>`         | reads the ticket and returns an ordered, file-scoped plan; writes no code                                                                                                       |
| `/grill-me <task>`     | interviews until the scope is shared, then hands off to `/plan`                                                                                                                 |
| `/sync-docs`           | sweeps the documentation the change touched and corrects what went stale                                                                                                        |
| `/review [target]`     | fans parallel `pr-reviewer` subagents over the branch, verifies each finding, reports — changes nothing                                                                         |
| `/phase-done <F1.x>`   | verifies the ticket's Acceptance Criteria one by one, runs the gate, drafts the PR text                                                                                         |
| `/prep-pr <F1.x>`      | tidies, gates, sweeps the docs, runs a review round, then commits, pushes and opens the PR                                                                                      |
| `/babysit-pr [#N]`     | polls CI, Sonar and the AI reviewers on an open PR, fixes what they find, stops at merge-ready                                                                                  |
| `/close-ticket <F1.x>` | after the merge: ticks the ticket's AC/DoD with evidence, corrects what the work made false, records the PRs and the decisions, puts ✅ in the title, returns to a fresh `main` |

## Hooks (`hooks/`)

Wired in [`settings.json`](settings.json). Blocking hooks exit 2 and the reason goes back to
the agent; advisory hooks exit 0 and their output becomes context. They parse their JSON
input with `node`, which this repository already requires — no extra prerequisite.

| Hook                                                         | Event                  | Behaviour                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`guard-bash.sh`](hooks/guard-bash.sh)                       | `PreToolUse` :: `Bash` | **blocks** npm/yarn, every way round the secret scan (`--no-verify`, `-n` and its bundles, `HUSKY=0`, `core.hooksPath`), pushes to `main`, reckless `rm -rf`. The entry point and the fail-closed wrapper; the decision is [`guard-bash.mjs`](hooks/guard-bash.mjs) |
| [`guard-db.sh`](hooks/guard-db.sh)                           | `PreToolUse` :: `Bash` | **blocks** `prisma migrate` / `db push` / `DROP` / `TRUNCATE` unless `DATABASE_URL` points at the local database                                                                                                                                                    |
| [`session-start-context.sh`](hooks/session-start-context.sh) | `SessionStart`         | prints branch, uncommitted count, last five commits; warns when the branch is `main`; when the branch names a ticket, points at that ticket and at the commands that close it out                                                                                   |
| [`stop-docs-drift.sh`](hooks/stop-docs-drift.sh)             | `Stop`                 | per area: names the document a changed area describes when that document did not change too — falling back to a general nudge when the session touched no `.md` at all                                                                                              |
| [`stop-scoping-drift.sh`](hooks/stop-scoping-drift.sh)       | `Stop`                 | when `schema.prisma` changed but the scoped-model registry did not, lists what a new user-owned table needs (registry, migration, cross-tenant test, `@map`)                                                                                                        |

### The guards have tests

[`hooks.test.sh`](hooks/hooks.test.sh) — `pnpm test:hooks`, and a step of the CI `unit` job.
The two blocking guards decide by pattern-matching a command string, so their failure mode is
silence: a pattern that stops matching still exits 0 and the command goes through. AI review
on PR #40 closed four defects across the pair; writing these cases found another, and two
rounds of [`/review`](commands/review.md) over the cases themselves found four more.

They all had one shape, and it took six rounds to see it: **the command means one thing to
bash and another to a pattern.** A quoted flag is still the flag; a wrapper carrying its own
option pushes the verb along; a grouping paren, a keyword, a line continuation and a nested
`$(…)` each change where a command begins. Every fix picked a different syntactic tell —
an anchor, a character class, the presence of quotes — and the next round found a spelling
that tell did not cover.

So the guard stopped matching text. [`guard-bash.mjs`](hooks/guard-bash.mjs) **tokenises the
command the way a shell does** — splitting on the operators, resolving quoting and escaping
exactly once — and the rules then talk about _words_: is this word `--no-verify`, is that word
an assignment of `HUSKY`, does this refspec name `main`. `git commit "--no-verify"` and
`git commit --no-verify` become the same list of words, so there is no spelling left to find;
and `git commit -m "use -n here"` keeps its message as a single word, so text inside it can
never be read as a flag — a distinction that cost three separate patches to approximate.

"The way a shell does" is a claim worth being precise about, because it is the claim the whole
design rests on. What it parses: word splitting, single and double quotes, backslash escapes
and line continuations, the operators `;` `&&` `||` `|` and newline, grouping with `( )` and
`{ }`, and command substitutions — `$(…)` and backticks — **including inside double quotes**,
which suppress word splitting but not execution. What it deliberately does not do, and the
honest boundary: it expands no variables and follows no command into another interpreter, so
`bash -c "…"`, `$VAR` in place of a literal, `$IFS` games and an encoded string get through,
as they did before. Those are in the file's own header too.

The cases are adversarial on purpose: every wrapper (`sudo`, `env`, `command`, an inline
assignment), every route round the secret scan, every refspec form that names main, and — just
as load-bearing — the ordinary commands that must stay allowed, because a guard that blocks
real work gets switched off. `guard-db.sh` additionally has to refuse **without** echoing the
command: a destructive command can carry its own credentials inline, so a test asserts the
password never reaches stderr.

`stop-scoping-drift.sh` deliberately does not parse the schema: the guarantee that a
user-owned model is registered is a unit test (`apps/api/test/scoped-models.spec.ts`), which
runs for everyone in CI. Re-implementing its logic in bash would drift from it silently, and a
check that quietly stops matching is worse than none — the same reasoning by which ADR-005
rejected "extension only, no rules for raw SQL".

The third guarantee is not a hook: `git commit`, `git push`, `git switch -c` and every
mutating `git branch` are deliberately **absent** from the allow list in `settings.json`, so
each of them prompts. Only the read-only spellings are listed, and as exact entries rather
than a `git branch*` prefix — the prefix once let `git branch -m` and `git branch -D main`
run unattended, which is not what "which tools may run without asking" was meant to grant.

`Bash(pnpm dlx *)` sits in the **`ask`** list rather than `deny`, and the difference is the
point. Rules resolve deny → ask → allow, first match wins, and specificity never changes that
order — so a deny cannot carry an exception, and denying `pnpm dlx` would have taken
`pnpm dlx shadcn@latest add` (the documented way to add a UI component, see
[`architecture.md`](rules/architecture.md)) away for good. An `ask` beats the broad
`Bash(pnpm *)` the same way a deny would, so nothing fetches and executes a package unattended
— four reviewers spawned with no user turn between them least of all — while the legitimate
use stays one confirmation away. Reach for `ask` whenever the answer is "not without me"
rather than "never". That is the mechanical twin of the top rule in `CLAUDE.md` — and the reason a
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
- more `agents/` — `migration-reviewer` (F3.1), `invariant-debugger` (F4.2).

Every phase carries the same DoD item: a repeatable pattern it introduced is captured here
in the same PR.

## Extending

- **New rule:** add `rules/<name>.md`, keep it to imperatives, and import it from
  `CLAUDE.md` — an unimported rule is a file nobody reads.
- **New command:** add `commands/<name>.md` with `description` (and `argument-hint` when it
  takes one). Give it an explicit output shape; that is what makes commands composable.
- **New agent:** add `agents/<name>.md` with `name` and `description` in the frontmatter,
  and write the body for a reader who has none of this session's context — that is the
  point of spawning one.
- **New hook:** add the script, `chmod 755`, wire it in `settings.json`. Decide first
  whether it blocks (exit 2) or advises (exit 0) — a blocking hook that fires on a false
  positive is worse than no hook. A **blocking** hook also lands with cases in
  [`hooks.test.sh`](hooks/hooks.test.sh), both the bypasses it must refuse and the ordinary
  commands it must let through; a guard nobody tests is a guard nobody knows still works.
- `settings.local.json` holds personal permission grants and is git-ignored.
- Update this file in the same change. It is documentation like any other: a table here
  that no longer matches the directory is exactly the drift `rules/specs.md` forbids.
