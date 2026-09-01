---
name: budget-invariant
description: The four budget numbers and how each is computed (ready to assign, assigned, activity, available), plus invariant 5.5 and the reconciliation that is not required to balance. Use when writing or reading code that computes budget money, or when a number on the categories screen looks wrong.
---

# The budget numbers

Nothing here is stored. Every number below is computed from two tables, `Transaction` and
`Assignment`, at the moment it is asked for. A column caching one of them is a second source
of truth (see [architecture](../../rules/architecture.md)). The statement that computes them
is [`budget-view.query.ts`](../../../apps/api/src/budget-view/budget-view.query.ts); read it
alongside this file.

All amounts are minor units in `bigint`, signed. An expense is a negative amount, so every
formula below adds rather than subtracts.

## The four numbers

For a category and a month `M`:

- **Activity** is the sum of that category's transactions dated inside `M`.
- **Assigned** is what the `Assignment` row for that category and `M` holds, and nothing else.
  Last month's leftover is not added in. It shows up instead as available being larger than
  assigned, which is what makes a carry-over visible on the screen.
- **Available** is Σ Assigned(≤ M) plus the sum of that category's transactions dated on or
  before the end of `M`. That is the carry-over, accumulated rather than reset.

For the budget as a whole:

- **Ready to assign** is the sum of transactions carrying **no category**, minus the sum of
  **every** assignment, future months included. It belongs to the budget rather than to a
  month, so it is the same number whichever month the screen is showing.

Two consequences that catch people out.

**Ready to assign is phrased over transactions without a category, never over income.** Three
different things arrive that way: an income, the system transaction an account's opening
balance is written as, and a reconciliation adjustment, which is often negative. A predicate
written as `type = 'INCOME'` drops two of the three and hands the user a pool that is wrong by
their whole starting balance. Both legs of a transfer also carry no category, and they cancel,
which is the correct outcome under this rule and an accident under any other one.

**Hiding never reaches a number.** A hidden category stays in every aggregate, so its past
activity keeps counting and the pool stays whole. What hiding decides is only which rows the
screen lists. So the sum over the rows one month **lists** is not the whole of Σ available: a
category the month leaves out still holds what it holds. The invariant is therefore read over
every category, never over one month's list. The property test does generate hiding, and reads
the all-time month twice, once asking for the hidden rows and once not, asserting the equation
on both. The second reading only balances because of the rule that keeps the screen whole: a
category holding a non-zero available may not be hidden, and the mutation that hides one refuses
it, so a hidden category's available is always zero. A counterexample carrying a `hide` step is
therefore about the rows the reading listed, not about a hidden category holding money.

## Invariant 5.5

```
ready to assign + Σ available = Σ balance
```

checked over **all-time** aggregates, where a balance is the sum of an account's transactions.
It holds because both sides are the same set of transactions counted once: available collects
the categorised ones plus every assignment, and the pool collects the uncategorised ones minus
every assignment.

**A per-month reconciliation is not required to balance, and asserting one is a wrong test
rather than a found bug.** An assignment to a future month lowers the pool the moment it is
written and appears in no current month's available. The two sides only meet over all of time.

The test is property-based with fast-check over random sequences of operations, at the
integration level because the arithmetic lives in SQL:
[`budget-invariant.integration.spec.ts`](../../../apps/api/test/budget-invariant.integration.spec.ts).
It reads the all-time aggregate by asking for a month far beyond any date it generates, and it
sums the balances in Prisma rather than through the API. The two are not the same number on
purpose: the accounts screen leaves an archived account out of its total, and this invariant
counts every account the budget holds. The equality still has to hold against the published
total, and what makes both readings true at once is that an account is archived only at a
balance of exactly zero. The two tests beside the property assert exactly that, one over an
account emptied through the API and one over an archived account carrying money, written
straight into the database because no request produces it. When
it goes red, [`invariant-debugger`](../../agents/invariant-debugger.md) reads the
counterexample.
