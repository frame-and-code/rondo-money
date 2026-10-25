# Testing

Levels, commands, layout and prerequisites are in [`docs/testing.md`](../../docs/testing.md);
how to write one that proves something is [`testing-patterns`](../skills/testing-patterns/SKILL.md).

- A feature without its tests is not done, and there is no "follow-up" for them.
  [`/tdd`](../commands/tdd.md) writes them first.
- Unit covers domain logic and components with no DB or network. Integration covers API and
  Postgres with the real module, and is the only level that proves atomicity, idempotency and
  the scoping a real query carried; the scoping extension's own rules are unit-testable
  without a database. E2E covers one or two user scenarios per feature, to prove the screens are
  wired, not to cover branches.
- Mandatory: invariant 5.5 as a property-based test (fast-check) over random operation
  sequences, asserted on all-time aggregates after every step; a cross-tenant test for every
  phase that adds domain tables and for every raw aggregate; a regression test with every bug
  fix, the one that fails before it.
- Assert behaviour, not implementation. Name what the test proves and cover the edge: zero,
  negative, month boundary, future month, duplicate request.
- When you report a run, say what passed and what failed. Never say "tests pass" without
  having run them.
