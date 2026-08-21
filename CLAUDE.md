> ⛔ On your own, only `git add`. `git commit`, `git push` and any other git action happen
> only when the user asks for them.
> If you are on the main branch, before starting a new feature, create a new branch from the main
> (naming — see `.claude/rules/communication.md`).

# CLAUDE.md

Context for Claude in the **Rondo Money** repository: what this project is, where things
live, and which rules are in force. The rules themselves live in
[`.claude/rules/`](.claude/rules/) and are imported below; the full map of the agent setup
— commands, hooks, permissions — is in [`.claude/README.md`](.claude/README.md).

## Project

Rondo Money — a zero-based budgeting app (YNAB-style). Monorepo on **Turborepo + pnpm**,
public under AGPL-3.0-only.

The canonical documents live in Notion: the **PRD (RU)** is the source of truth, PRD (EN)
mirrors it, the **Development Plan v1 (High-Level)** owns the phases and their DoD, and the
ADRs hold the decisions — ADR-001 (a change log instead of event sourcing, revised by
ADR-006), ADR-002 (a separate NestJS backend owns all DB access), ADR-003 (public repository
under AGPL-3.0-only), ADR-004 (locale detection — proposed, deferred), ADR-005 (no RLS;
isolation lives in the backend), ADR-006 (no server-side change log and no soft-delete; undo
is a stack in the browser, and the single write point stays for atomicity).

## Structure

- `apps/web` — Next.js (App Router). Skeleton — F0.5.
- `apps/api` — NestJS (REST). Skeleton — F0.4.
- `packages/db` — Prisma schema and migrations (F0.4); grows incrementally per phase.
- `packages/types` — shared DTOs; money as `bigint` in minor units, with the currency's
  digit count. Emits to `dist`, so `apps/api` can call its functions and not merely name
  their types.
- `packages/api-client` — typed API client generated from the NestJS OpenAPI spec
  (F1.4, ADR-002); `apps/web` consumes it instead of hand-written fetch.
- `packages/config` — shared configs: eslint / tsconfig / prettier (F0.2).
- `packages/ui` — UI components, shadcn/ui (F0.6).
- `.claude/` — the agent setup: rules, commands, skills, agents, hooks, permissions.

## Commands

`pnpm install`; then `pnpm dev | build | lint | typecheck | test`, and `pnpm format` — the
first five are Turborepo tasks across all workspaces, the last is Prettier at the root.
`pnpm dev` also watches `@rondo/types` and `@rondo/db`, so a change in a package reaches the
running app without a manual build ([`apps/api/README.md`](apps/api/README.md)).

`format:check`, `scan:secrets`, `lint:hooks`, `test:hooks` and `lint:docs` are root scripts
rather than
turbo tasks, and every one of them is a gate step — a turbo task only reaches a workspace, and
`.claude/` is not one. The gate's own membership lives in [`docs/ci.md`](docs/ci.md).

In a session: `/dev` brings the local stack up, `/check` runs the gate, `/plan` decomposes a
ticket, `/grill-me` clarifies a fuzzy one, `/tdd` builds one test-first — scenarios, your
confirmation, red tests, then the implementation that turns them green — `/sync-docs` sweeps the documentation,
`/review` runs parallel reviewers with clean context over the branch, `/phase-done` closes a
ticket out, `/prep-pr` commits, pushes and opens the PR, `/babysit-pr` shepherds it to
merge-ready and `/close-ticket` records the merged result in the Notion ticket — the PRs that
carried it and the decisions it took, not only the ✅ — then returns you to a fresh `main` and
deletes the local branches it just closed, so the next ticket starts where it should.

## Process

We work feature by feature from "Plan v1", which owns the phase list. Stay inside the scope
of the ticket you were given — don't pull in work from later features, and don't widen the
ticket into cleanups it never opened. If a session starts without a ticket, ask which one
before writing code. No phase number here on purpose — it belongs to the ticket and the
branch, which move on their own, and a stale one in this file reads as current. That line
was wrong twice before it was removed.
When in doubt, check against the PRD (RU, source of truth) and the ADRs. A green `main`
ships to the dev environment on Railway — see [`docs/deploy-railway.md`](docs/deploy-railway.md).

## Rules

@.claude/rules/model-integrity.md
@.claude/rules/architecture.md
@.claude/rules/security.md
@.claude/rules/code-quality.md
@.claude/rules/specs.md
@.claude/rules/testing.md
@.claude/rules/communication.md
