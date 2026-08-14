> ⛔ On your own, only `git add`. `git commit`, `git push` and any other git action happen
> only when the user asks for them.
> If you are on the main branch, before starting a new feature, create a new branch from the main
> (naming — see Git workflow).

# CLAUDE.md

Rules and context for Claude in the **Rondo Money** repository.

## Top rule

As you work, only `git add` the relevant files. Committing, pushing, branching, rebasing,
opening PRs — any git action beyond `git add` — happens on the user's explicit instruction,
never on your own initiative.

## Language

Everything that goes into git — code, code comments, docs, scripts, commit messages — is written in **English** (the project is open source, so anyone may read it). Some older files still carry Russian comments; do not imitate them — new and edited text is English. Chat with the user in their language (Russian).

## Git workflow

Branch names, commit messages and PR text describe **what changes for the app and why** —
not which files were touched or how the code was rewritten. A reader who never opens the
diff should still understand what this work does. Everything is in English (see Language).
Claude drafts them; the actual `commit` / `push` / PR happens when the user asks (Top rule).

- **Branch:** `F<phase>.<feature>-<what-it-does>` — the Notion ticket number plus a short
  kebab-case description of what is being added or fixed.
  ✅ `F1.1-add-clerk-to-frontend`, `F0.10-fix-railway-cache-mounts`
  ❌ `feature/updates`, `F1.1`, `fix-layout-and-proxy`
- **Commit:** Conventional Commits with the ticket as the scope —
  `<type>(F<x.x>): <what changed, in behaviour terms>`. Types: `feat`, `fix`, `chore`,
  `docs`, `refactor`, `test`, `build`, `ci`, `perf`. Describe the effect, not the edit.
  ✅ `feat(F1.1): protect all routes and add a sign-in page`
  ❌ `feat(F1.1): edit layout.tsx, proxy.ts and turbo.json`
- **PR title:** the problem the PR solves, readable on its own in the PR list.
  ✅ `F1.1: close the app to anonymous visitors and add Clerk sign-in`
  ❌ `F1.1: Clerk changes`, `Update middleware and env files`
- **PR description:** English, plain language, split into sections with bullet points,
  detailed enough to review without reconstructing the reasoning from the diff:
  - **What & why** — the problem and what the app does differently now.
  - **Changes** — bullets, user-visible behaviour first, then supporting work
    (config, CI, dependencies); say why each non-obvious one was needed.
  - **Testing** — what was run and what it proves (including manual checks).
  - **Notes / follow-ups** — anything the reviewer must do by hand (secrets, env
    variables, dashboard settings) and deliberate gaps left for later.

## Project

Rondo Money — a zero-based budgeting app (YNAB-style). Monorepo on **Turborepo + pnpm**.
Canonical documents live in Notion: PRD (RU) — source of truth, PRD (EN) — mirror, ADR-001
(a change log instead of event sourcing), and the "Development Plan v1 (High-Level)".

## Structure

- `apps/web` — Next.js (App Router). Skeleton — F0.5.
- `apps/api` — NestJS (REST). Skeleton — F0.4.
- `packages/db` — Prisma schema and migrations (F0.4); grows incrementally per phase.
- `packages/types` — shared DTOs; money as `BigInt` in minor units.
- `packages/api-client` — typed API client generated from the NestJS OpenAPI spec (F1, ADR-002); web consumes it instead of hand-written fetch.
- `packages/config` — shared configs: eslint / tsconfig / prettier (F0.2).
- `packages/ui` — UI components, shadcn/ui (F0.6).

## Commands

`pnpm install`; then `pnpm dev | build | lint | test` (run via Turborepo across all workspaces).

## Cross-cutting principles

- Do not store derived state (balance, RTA, "Available", net worth) — compute it on the fly.
- Money is integer minor units in `BigInt`; the digit count comes from the currency (ISO 4217), not a hardcoded "2". Over the wire, serialize money as a **string** (JSON has no native BigInt) — convention lives in `packages/types`.
- Every record carries `userId` (and `budgetId`) — groundwork for RLS. Reads are auto-scoped by a Prisma Client Extension, but it does **not** cover `$queryRaw`/`$executeRaw` — scope raw aggregates (balance/RTA/Available) explicitly through a context-aware repository, and prefer enabling Postgres RLS once raw aggregates exist (RLS covers raw SQL; expect a per-request `SET LOCAL` with pooling).
- Mutations go only through a single write point (atomic: state + the `ChangeLog` journal). A transfer's two legs share a `transferId` and are created/edited/deleted/undone together in one transaction. undo/redo are themselves logged mutations (redo tracked by a cursor, not by rewriting history).
- Invariant 5.5: `RTA + Σ Available = Σ Balance` — keep it green, checked over **all-time** aggregates (a future-month assignment lowers RTA before it shows in any month's Available, so a per-month reconciliation won't balance — that's expected). Cover with property-based tests (fast-check).
- Dates are plain calendar dates (no time-of-day); "today" and month bucketing (`YYYY-MM`) use one fixed reference timezone (the budget's).
- Deleting a category must keep its past Activity counted in the aggregates (block while referenced / reassign / soft-delete) — never orphan an expense.
- Grow the DB schema incrementally: each phase brings its own migration.
- Frontend UI is **Tailwind + shadcn/ui** (`packages/ui`, theme Ocean Breeze, F0.6) — build screens by composing shadcn/ui components and Tailwind utilities; don't hand-write CSS, inline `style` props, or bespoke components. Missing primitive? Add it via `pnpm dlx shadcn@latest add <component>` into `packages/ui`, don't roll your own.
- Write tests together with the feature; don't accrue debt. Green `main` ships to dev (Railway).

## Process

We work feature by feature from "Plan v1". Current phase — 1 (F1.1–F1.10); phase 0 is done.
Don't go beyond the scope of the current feature — don't pull in work from later features.
When in doubt, check against the PRD (RU, source of truth) and ADR-001.
