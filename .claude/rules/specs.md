# Decisions and documentation

Two bodies of prose have to stay true: the canonical documents in Notion, which say what we
decided and why, and the documents in this repository, which say how the thing is run. Both
are inputs to the work, not paperwork after it.

## Notion

- PRD (RU) is the source of truth; PRD (EN) mirrors it. Development Plan v1 holds the phases
  and their DoD. The ADRs hold the decisions, and [`CLAUDE.md`](../../CLAUDE.md) names each
  one with its status. The phase ticket holds the Acceptance Criteria.
- Before a feature, read its ticket and the ADRs covering the area. During it, do not
  reintroduce what a decision moved away from: RLS, stored balances and a hand-written API
  layer are decisions. After it, when the work supersedes a decision, update the ADR or ticket
  in the same change and mark the old statement superseded.
- An open question is answered by the user and written back into the ticket, in the writing
  [communication](communication.md) asks for.
- When the work lands, the ticket gets what the diff cannot show: the PRs that carried it and
  the decisions taken along the way. [`/close-ticket`](../commands/close-ticket.md) does that.

## Repository documents

A change is not finished until the prose describing it is true again, in the same PR. Look
in `README.md`, `docs/` (`ci.md`, `deploy-railway.md`, `testing.md`), the workspace `README.md`
next to the code you touched, `CLAUDE.md` and `.claude/` when a rule or command moves, and
`SECURITY.md` / `CONTRIBUTING.md` / `NOTICE` when the repository's stance changes.
[`/sync-docs`](../commands/sync-docs.md) runs the sweep.

## Write so it cannot drift

- One home per fact; every other file links to it.
  [`docs-ownership.json`](../config/docs-ownership.json) names the owner of each fact that has
  drifted once, and `pnpm lint:docs` fails the gate when the phrase appears elsewhere, when a
  relative link has no target, or on the prose spellings it lists. Add an entry the moment a
  fact acquires a second home.
- State the rule, not the measurement. No reproduction transcripts, quoted tool output or
  version-pinned symptoms.
- No war stories: what was tried, what broke, which PR caught it. The decision lives in its
  Notion ticket.
- No counts, inventories or line references; they go stale on the next commit.
- No phase or ticket numbers in repository prose. Strip them from every sentence you rewrite.
- Something planned and not built is written in the future tense or not at all.

## Patterns belong in `.claude/`

A repeatable pattern a phase introduced is captured as a rule or a skill in the same PR. An
unwritten pattern is one the next agent reinvents, differently.
