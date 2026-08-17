# Testing

Levels, commands, file layout and prerequisites are in
[`docs/testing.md`](../../docs/testing.md) — read it rather than guessing, and update it
when any of that changes. This file is only the part that governs _when_ and _what_.

## Written with the feature

A feature without its tests is not done. No test debt is accrued for later, and "I'll add
the test in a follow-up" is not an option the DoD offers.

## What each level is for

- **Unit** — domain logic and components, no DB or network. Cheapest, so most coverage
  lives here.
- **Integration** — API ↔ Postgres: the real module, real queries, real transactions.
  This is the only level that can prove atomicity, scoping and soft-delete behaviour.
- **E2E** — one or two user scenarios per feature. The most expensive level: use it to
  prove the screens are wired together, not to cover branches.

## Mandatory tests

- **Invariant 5.5** (`RTA + Σ Available = Σ Balance`) is property-based, with fast-check,
  over random sequences of operations, asserted on **all-time** aggregates after every
  step. Do not write a per-month reconciliation — see [architecture](architecture.md).
- **Cross-tenant** ("user B sees nothing of user A's") for every phase that adds domain
  tables, and specifically for every raw aggregate, since those bypass the Prisma extension
  (see [security](security.md)).
- **A regression test with every bug fix** — the one that fails before the fix.

## What a test must prove

Assert behaviour, not implementation: a test that mirrors the code line by line only
proves the code was written twice. Name what it proves, cover the edge (zero, negative,
month boundary, future month, duplicate request), and when you report a run, say what
passed and what failed — never that "tests pass" without having run them.
