# Decisions and documentation

Two bodies of prose have to stay true: the canonical documents in Notion, which say what
we decided and why, and the documents in this repository, which say how the thing is run.
Both are **inputs** to the work, not paperwork produced after it.

## The canonical documents (Notion)

- **PRD (RU)** — the source of truth. PRD (EN) is a mirror; when they disagree, RU wins.
- **Development Plan v1 (High-Level)** — phases, the per-phase DoD, the table of migrations.
- **ADRs** — ADR-001 (a change log instead of event sourcing), ADR-002 (a separate NestJS
  backend owns all DB access), ADR-003 (public repository, AGPL-3.0-only), ADR-004 (locale
  detection — proposed, deferred), ADR-005 (no RLS; isolation lives in the backend).
- **The phase ticket** — the feature currently being built, with its own Acceptance
  Criteria.

## Read before, not only write after

- **Before** starting a feature, read its ticket and the ADRs covering the area. Establish
  what was already decided instead of re-deriving it.
- **During**, do not reintroduce something a decision deliberately moved away from. RLS,
  stored balances and a hand-written API layer are decisions, not omissions.
- **After**, when the work changes or supersedes a decision, update the ADR or the ticket
  that holds it in the same change — and mark the old statement superseded rather than
  leaving it looking current. Silently reversing a decision destroys the "why we changed
  our minds", which is the part nobody can reconstruct later.
- An open question in the PRD or the plan is answered by the user and written back into
  the ticket (see [model integrity](model-integrity.md)).

## Repository documents

A feature, a fix or a config change is not finished until the prose describing it is true
again, and the corrections go into the **same** PR — a follow-up "docs" task is how drift
starts. Where to look:

- `README.md` — how the project is run and what state it is in;
- `docs/` — `ci.md` (job graph, required checks), `deploy-railway.md` (services, variables,
  domains, ports), `testing.md` (levels, commands, prerequisites);
- the workspace `README.md` next to the code you touched (`apps/*`, `packages/*`) — the
  structure trees and the "skeleton, arrives in F0.x" lines rot fastest;
- `CLAUDE.md` and `.claude/` when a decision moves: a new or amended ADR, a changed phase
  scope, a new cross-cutting rule, a new command or hook;
- `SECURITY.md` / `CONTRIBUTING.md` / `NOTICE` when repository settings, the licence or the
  contribution stance change.

`/sync-docs` runs this sweep. Prefer deleting a sentence to leaving it half-true, and when
a document describes something planned but not yet built, say so in the text instead of
writing the intent in the present tense.

## Patterns belong in `.claude/`

When a phase establishes a repeatable pattern — how to write a mutation, how to compute an
aggregate, how to review a migration — capture it as a rule or a skill in the same PR.
This is a DoD item of every phase. An unwritten pattern is one the next agent will
reinvent, differently.
