> ⛔ On your own, only `git add`. `git commit`, `git push` and any other git action happen
> only when the user asks for them.
> If you are on the main branch, before starting a new feature, create a new branch from the main
> (for naming, see `.claude/rules/communication.md`).

# CLAUDE.md

Context for Claude in the **Rondo Money** repository: what this project is, where things
live, and which rules are in force. The rules live in [`.claude/rules/`](.claude/rules/) and
Claude Code loads them itself: the ones without a `paths:` frontmatter on every turn, and
[`api.md`](.claude/rules/api.md) and [`web.md`](.claude/rules/web.md) only while work touches
the workspace each describes.
[`.claude/README.md`](.claude/README.md) holds the full map of the agent setup.

## Project

Rondo Money is a zero-based budgeting app: every unit of money you hold is assigned a job
before it is spent. Monorepo on **Turborepo + pnpm**, public under AGPL-3.0-only.

The canonical documents live in Notion. The **PRD (RU)** is the source of truth, PRD (EN)
mirrors it, the **Development Plan v1 (High-Level)** owns the phases and their DoD, and the
ADRs hold the decisions: ADR-001 (a change log instead of event sourcing, revised by
ADR-006), ADR-002 (a separate NestJS backend owns all DB access), ADR-003 (public repository
under AGPL-3.0-only), ADR-004 (locale detection, proposed and deferred), ADR-005 (no RLS;
isolation lives in the backend), ADR-006 (no server-side change log and no soft-delete; undo
is a stack in the browser, and the single write point stays for atomicity).

## Structure

- `apps/web` is Next.js (App Router): the app shell and its navigation, the sign-in screen and
  the onboarding screens, which sit outside the shell and end by opening it on Categories. A
  gate in each group's layout decides which of the three a visitor gets. Behind the shell sit
  its sections, which [`apps/web/README.md`](apps/web/README.md) describes.
- `apps/api` is NestJS (REST).
- `packages/db` holds the Prisma schema and migrations; it grows one migration per phase.
- `packages/types` holds the shared DTOs, money as `bigint` in minor units with the
  currency's digit count, and calendar dates. It emits to `dist`, so `apps/api` can call its
  functions.
- `packages/api-client` is the typed API client generated from the NestJS OpenAPI spec;
  `apps/web` consumes it instead of hand-written fetch.
- `packages/config` holds the shared configs: eslint / tsconfig / prettier.
- `packages/ui` holds the UI components, shadcn/ui.
- `.claude/` holds the agent setup: rules, commands, skills, agents, hooks, permissions.

## Commands

`pnpm install`; then `pnpm dev | build | lint | typecheck | test`, and `pnpm format`. The
first five are Turborepo tasks across all workspaces, the last is Prettier at the root.
`pnpm dev` also watches `@rondo/types` and `@rondo/db`
([`apps/api/README.md`](apps/api/README.md)).

`format:check`, `scan:secrets`, `lint:hooks`, `test:hooks` and `lint:docs` are root scripts
rather than turbo tasks, and every one of them is a gate step, because a turbo task only
reaches a workspace and `.claude/` is not one. The gate's membership lives in
[`docs/ci.md`](docs/ci.md).

In a session: `/dev` brings the local stack up, `/check` runs the gate, `/plan` decomposes a
ticket, `/grill-me` clarifies a fuzzy one, `/tdd` builds a ticket test-first, `/sync-docs`
sweeps the documentation, `/review` runs parallel reviewers with clean context over the
branch, `/phase-done` closes a ticket out, `/prep-pr` commits, pushes and opens the PR,
`/babysit-pr` shepherds it to merge-ready, and `/close-ticket` records the merged result in
Notion, returns you to a fresh `main` and deletes the local branches it closed.

## Process

We work feature by feature from "Plan v1", which owns the phase list. Stay inside the scope
of the ticket you were given: no work from later features, no cleanups the ticket never
opened. If a session starts without a ticket, ask which one before writing code. When in
doubt, check against the PRD (RU) and the ADRs. A green `main` ships to the dev environment on
Railway ([`docs/deploy-railway.md`](docs/deploy-railway.md)).

When compacting, keep the ticket, the list of files changed, the gate commands that ran and
their results, and any decision the user took in the session.
