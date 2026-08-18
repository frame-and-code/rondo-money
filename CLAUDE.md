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
ADRs hold the decisions — ADR-001 (a change log instead of event sourcing), ADR-002 (a
separate NestJS backend owns all DB access), ADR-003 (public repository under AGPL-3.0-only),
ADR-004 (locale detection — proposed, deferred), ADR-005 (no RLS; isolation lives in the
backend).

## Structure

- `apps/web` — Next.js (App Router). Skeleton — F0.5.
- `apps/api` — NestJS (REST). Skeleton — F0.4.
- `packages/db` — Prisma schema and migrations (F0.4); grows incrementally per phase.
- `packages/types` — shared DTOs; money as `bigint` in minor units.
- `packages/api-client` — typed API client generated from the NestJS OpenAPI spec
  (F1.4, ADR-002); `apps/web` consumes it instead of hand-written fetch.
- `packages/config` — shared configs: eslint / tsconfig / prettier (F0.2).
- `packages/ui` — UI components, shadcn/ui (F0.6).
- `.claude/` — the agent setup: rules, commands, hooks, permissions.

## Commands

`pnpm install`; then `pnpm dev | build | lint | typecheck | test | format` (Turborepo, across
all workspaces). `pnpm scan:secrets` runs the full-history gitleaks scan (`secret-scan.sh`,
shared with the pre-commit hook and the CI `secrets` job).

In a session: `/dev` brings the local stack up, `/check` runs the gate, `/plan` decomposes a
ticket, `/grill-me` clarifies a fuzzy one, `/sync-docs` sweeps the documentation,
`/phase-done` closes a ticket out and `/babysit-pr` shepherds an open PR to merge-ready.

## Process

We work feature by feature from "Plan v1". Current phase — 1 (F1.1–F1.13); phase 0 is done.
Don't go beyond the scope of the current feature — don't pull in work from later features.
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
