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

## Documentation

A feature, a fix or a config change isn't finished until the prose describing it is true
again. Every change ends with a sweep over the docs it touches, and the corrections go into
the **same** PR — a follow-up "docs" task is how drift starts. Where to look:

- `README.md` — how the project is run and what state it is in;
- `docs/` — `ci.md` (job graph, required checks), `deploy-railway.md` (services, variables,
  domains, ports), `testing.md` (levels, commands, prerequisites);
- the workspace `README.md` next to the code you touched (`apps/*`, `packages/*`) — the
  structure trees and the "skeleton, arrives in F0.x" lines rot fastest;
- `CLAUDE.md` itself when a decision moves: a new or amended ADR, a changed phase scope, a
  new cross-cutting rule;
- `SECURITY.md` / `CONTRIBUTING.md` / `NOTICE` when repository settings, the licence or the
  contribution stance change.

A sentence that has quietly become false is worse than no sentence at all — it is trusted
and acted on. So: delete rather than leave half-true, and when a document describes
something that is planned but not yet configured, say that in the text instead of writing
the intent in the present tense.

## Project

Rondo Money — a zero-based budgeting app (YNAB-style). Monorepo on **Turborepo + pnpm**.
Canonical documents live in Notion: PRD (RU) — source of truth, PRD (EN) — mirror, the
"Development Plan v1 (High-Level)", and the ADRs: ADR-001 (a change log instead of event
sourcing), ADR-002 (a separate NestJS backend owns all DB access), ADR-003 (public
repository under AGPL-3.0-only), ADR-004 (locale detection — proposed, deferred), ADR-005
(no RLS — see the scoping principle below).

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
`pnpm scan:secrets` — full-history gitleaks scan (`secret-scan.sh`, shared with the pre-commit hook and the CI `secrets` job).

## Cross-cutting principles

- Do not store derived state (balance, RTA, "Available", net worth) — compute it on the fly.
- Money is integer minor units in `BigInt`; the digit count comes from the currency (ISO 4217), not a hardcoded "2". Over the wire, serialize money as a **string** (JSON has no native BigInt) — convention lives in `packages/types`.
- Every record carries `userId` (and `budgetId`), but **Postgres RLS is deliberately not used** (ADR-005) — isolation lives entirely in the backend: a guard puts `userId` in the request context, a Prisma Client Extension auto-scopes scoped models, and a query without context is an error rather than an unfiltered read. The extension does **not** cover `$queryRaw`/`$executeRaw`, so raw aggregates (balance/RTA/Available) go through a context-aware repository, a lint rule keeps raw SQL out of everywhere else, and cross-tenant tests ("B cannot see A's data") belong to the DoD of every phase that adds domain tables. Treat the lint rule and those tests as part of the decision, not as polish: they are what replaces the database-level guarantee, and a forgotten `where userId` fails silently. The columns stay, so RLS remains cheap to add if the triggers in ADR-005 fire (shared budgets, a second DB client, a regulator).
- Mutations go only through a single write point (atomic: state + the `ChangeLog` journal). A transfer's two legs share a `transferId` and are created/edited/deleted/undone together in one transaction. undo/redo are themselves logged mutations (redo tracked by a cursor, not by rewriting history).
- Invariant 5.5: `RTA + Σ Available = Σ Balance` — keep it green, checked over **all-time** aggregates (a future-month assignment lowers RTA before it shows in any month's Available, so a per-month reconciliation won't balance — that's expected). Cover with property-based tests (fast-check).
- Dates are plain calendar dates (no time-of-day); "today" and month bucketing (`YYYY-MM`) use one fixed reference timezone (the budget's).
- Deleting a category must keep its past Activity counted in the aggregates (block while referenced / reassign / soft-delete) — never orphan an expense.
- Grow the DB schema incrementally: each phase brings its own migration.
- Frontend UI is **Tailwind + shadcn/ui** (`packages/ui`, theme Ocean Breeze, F0.6) — build screens by composing shadcn/ui components and Tailwind utilities; don't hand-write CSS, inline `style` props, or bespoke components. Missing primitive? Add it via `pnpm dlx shadcn@latest add <component>` into `packages/ui`, don't roll your own.
- Write tests together with the feature; don't accrue debt. Green `main` ships to dev (Railway).

## Process

We work feature by feature from "Plan v1". Current phase — 1 (F1.1–F1.11); phase 0 is done.
Don't go beyond the scope of the current feature — don't pull in work from later features.
When in doubt, check against the PRD (RU, source of truth) and ADR-001.
