# Decisions and documentation

Two bodies of prose have to stay true: the canonical documents in Notion, which say what
we decided and why, and the documents in this repository, which say how the thing is run.
Both are **inputs** to the work, not paperwork produced after it.

## The canonical documents (Notion)

- **PRD (RU)** is the source of truth. PRD (EN) is a mirror; when they disagree, RU wins.
- **Development Plan v1 (High-Level)** holds the phases, the per-phase DoD and the table of
  migrations.
- **ADRs**: ADR-001 (a change log instead of event sourcing, **revised by ADR-006**),
  ADR-002 (a separate NestJS backend owns all DB access), ADR-003 (public repository,
  AGPL-3.0-only), ADR-004 (locale detection, proposed and deferred), ADR-005 (no RLS;
  isolation lives in the backend), ADR-006 (no server-side change log; undo is a client
  stack).
- **The phase ticket** is the feature currently being built, with its own Acceptance
  Criteria.

## Read before, not only write after

- **Before** starting a feature, read its ticket and the ADRs covering the area. Establish
  what was already decided instead of re-deriving it.
- **During**, do not reintroduce something a decision deliberately moved away from. RLS,
  stored balances and a hand-written API layer are decisions, not omissions.
- **After**, when the work changes or supersedes a decision, update the ADR or the ticket
  that holds it in the same change, and mark the old statement superseded rather than
  leaving it looking current. Silently reversing a decision destroys the "why we changed
  our minds", which is the part nobody can reconstruct later.
- An open question in the PRD or the plan is answered by the user and written back into
  the ticket (see [model integrity](model-integrity.md)).
  Write a ticket the way [communication](communication.md) asks: no em dash, plain words, one idea
  per sentence, and the decision stated rather than described. No gate reaches Notion.

- **When the work lands**, the ticket gets what the diff cannot show: which PRs carried it,
  and the decisions taken along the way. Those are the option rejected and why, the boundary
  drawn, the rule that changed. [`/close-ticket`](../commands/close-ticket.md) does this
  sweep. A ticket that records only that the work is done leaves the next agent to re-decide
  everything, which is the failure this whole rule exists to prevent.

## Repository documents

A feature, a fix or a config change is not finished until the prose describing it is true
again, and the corrections go into the **same** PR. A follow-up "docs" task is how drift
starts. Where to look:

- `README.md` says how the project is run and what state it is in;
- `docs/` holds `ci.md` (job graph, required checks), `deploy-railway.md` (services,
  variables, domains, ports) and `testing.md` (levels, commands, prerequisites);
- the workspace `README.md` next to the code you touched (`apps/*`, `packages/*`), where the
  structure trees and the "skeleton, arrives in F0.x" lines rot fastest;
- `CLAUDE.md` and `.claude/` when a decision moves: a new or amended ADR, a changed phase
  scope, a new cross-cutting rule, a new command or hook;
- `SECURITY.md` / `CONTRIBUTING.md` / `NOTICE` when repository settings, the licence or the
  contribution stance change.

`/sync-docs` runs this sweep.

## Write so it cannot drift

Drift is not an accident of carelessness; it is a property of how the sentence was written.
The test before adding one is not "is this true today" but "what would make it false, and
would anyone find out". Sentences that fail it cost real reviews. A stale document sends a
reviewer to argue with the code, and those reviewers are rate-limited.

- **One home per fact.** Each fact is written in exactly one file; every other file links to
  it. About to explain the same mechanism a second time? Link instead. This one is mechanical:
  [`docs-ownership.json`](../config/docs-ownership.json) names the owner of each fact that has
  already drifted once, and `pnpm lint:docs` fails the gate when one of those phrases appears
  elsewhere, when a relative link has no target, or on the prose spellings it lists. It matches
  phrases rather than meaning, so it refuses the copy-paste and not the paraphrase. The rest of
  this section is yours to keep. Add an entry the moment a fact acquires a second home.
- **State the rule, not the measurement.** "Money is minor units in `bigint`" survives
  anything. A reproduction transcript, quoted tool output or a version-pinned symptom is
  false the moment the tool moves, and it was never an instruction.
- **No war stories.** None of this tells anyone what to do now: what was tried, what broke,
  which PR caught it, how many rounds it took. The decision lives in its Notion ticket.
- **Name the mechanism, not today's numbers.** Counts, inventories and line references go
  stale on the next commit.
- **Prefer deleting to hedging.** A sentence that cannot be stated plainly is one nobody has
  understood well enough to write yet.
- Something planned and not built is written in the future tense or not at all.

## Patterns belong in `.claude/`

A phase establishes repeatable patterns: how to write a mutation, how to compute an
aggregate, how to review a migration. Capture each one as a rule or a skill in the same PR.
This is a DoD item of every phase. An unwritten pattern is one the next agent will
reinvent, differently.
