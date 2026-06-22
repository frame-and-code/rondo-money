> ⛔ NEVER commit on your own. Only `git add`. `git commit` and `git push` are done by the user only.

# CLAUDE.md

Rules and context for Claude in the **Fin Flow AI** repository.

## Top rule

Do not create commits. As you work, only `git add` the relevant files. The user commits and pushes themselves.

## Project

Fin Flow AI — a zero-based budgeting app (YNAB-style). Monorepo on **Turborepo + pnpm**.
Canonical documents live in Notion: PRD (RU) — source of truth, PRD (EN) — mirror, ADR-001
(a change log instead of event sourcing), and the "Development Plan v1 (High-Level)".

## Structure

- `apps/web` — Next.js (App Router). Skeleton — F0.5.
- `apps/api` — NestJS (REST). Skeleton — F0.4.
- `packages/db` — Prisma schema and migrations (F0.4); grows incrementally per phase.
- `packages/types` — shared DTOs; money as `BigInt` in minor units.
- `packages/config` — shared configs: eslint / tsconfig / prettier (F0.2).
- `packages/ui` — UI components, shadcn/ui (F0.6).

## Commands

`pnpm install`; then `pnpm dev | build | lint | test` (run via Turborepo across all workspaces).

## Cross-cutting principles

- Do not store derived state (balance, RTA, "Available", net worth) — compute it on the fly.
- Money is integer minor units in `BigInt`; the number of digits comes from the currency (ISO 4217), not a hardcoded "2".
- Every record carries `userId` (and `budgetId`) — groundwork for RLS.
- Mutations go only through a single write point (atomic: state + the `ChangeLog` journal).
- Invariant 5.5: `RTA + Σ Available = Σ Balance` — keep it green (the basis of automated tests).
- Grow the DB schema incrementally: each phase brings its own migration.
- Write tests together with the feature; don't accrue debt. Green `main` ships to dev (Railway).

## Process

We work feature by feature from "Plan v1". Current phase — 0 (F0.1–F0.10). Don't go beyond the scope
of the current feature — don't pull in work from future F0.x. When in doubt, check against the
PRD (RU, source of truth) and ADR-001.
