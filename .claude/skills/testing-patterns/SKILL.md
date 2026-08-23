---
name: testing-patterns
description: Which level actually proves a claim in this repository, the traps that make a passing test prove nothing, probe controllers where no endpoint exists yet, and concurrency. Use when adding or fixing tests in apps/api, or when a test passes and you are not sure it proved anything.
---

# Testing patterns

Two documents own this ground and are read first, not summarised here:
[`docs/testing.md`](../../../docs/testing.md) for the levels, the commands, the file layout,
the prerequisites and the scoping helpers a spec needs, and
[`testing`](../../rules/testing.md) for what is mandatory and when. This skill is the
judgement that fits in neither: which level actually proves a claim, and the ways a passing
test here proves nothing.

## Pick the level by what only that level can prove

A test at the wrong level is not a slower test, it is a weaker one. Asserting a rollback
against a mocked client proves the mock.

- Anything expressible as a function over its inputs belongs in a unit test, and the scoping
  extension is one of those: it is `(client, context, resolver)`, so its rules are unit-testable
  with no database at all.
- Atomicity, a unique index, a foreign key, concurrency and the scoping a real `where` clause
  did or did not carry are integration, because Postgres is the only thing that can answer
  them.
- A screen wired end to end is e2e, and one or two scenarios per feature is the budget.

## The three ways a green run lies here

1. **The assertion that matches anything.** Every unit spec builds its client against an
   unreachable database, so `rejects.toThrow()` with no argument is satisfied by a connection
   error and proves nothing. Match the message the code under test produces. For the opposite
   claim, that a call got past every rule, match `/reach database server|ECONNREFUSED/i`, which
   says it reached the driver. Where the message is not the point, capture the arguments with a
   second `$extends` that short-circuits the driver
   ([`scoped-operations.spec.ts`](../../../apps/api/test/scoped-operations.spec.ts)).
2. **The filter that ran nothing.** `apps/api`'s unit config carries `--passWithNoTests` and
   ignores `*.integration.spec.ts` by name, so a filter that matched no file reports success.
   Check what ran, and run an integration scenario with `test:integration`.
3. **The test written after the code.** It can only mirror what was built, misreading
   included. Where one is unavoidable, break the production line it depends on, watch it fail,
   and put it back.

## Where there is no endpoint yet

Declare a probe controller on the testing module and drive the real chain through it
([`budget-scoping.integration.spec.ts`](../../../apps/api/test/budget-scoping.integration.spec.ts),
[`scoped-raw.integration.spec.ts`](../../../apps/api/test/scoped-raw.integration.spec.ts)).
To observe something the response cannot show, such as whether a query happened at all,
override the provider with a counting wrapper around the real one rather than a stub, so what
runs is still the real behaviour.

## Concurrency

Two requests are two calls to `context.run`, never one `run` around a `Promise.all`: a shared
store makes both callers the same user, and the test then passes for the wrong reason. Assert
the outcome and never a duration, or the suite acquires a flake that fails on a slow machine
([`mutation.integration.spec.ts`](../../../apps/api/test/mutation.integration.spec.ts)).
