---
name: refuse-a-write-on-an-aggregate
description: Write a mutation whose refusal depends on a sum over many rows, without leaving a window where a concurrent write slips past the check. Use when hiding a category, archiving an account, closing anything that must be empty first.
---

# A write the numbers have to allow

Some writes are refused by an aggregate rather than by the row they touch. Hiding a category is
the case this pattern comes from: it is refused while the category still holds money over any
month, and what it holds is a sum of assignments and transactions rather than a column.

The read path is [`aggregate-query`](../aggregate-query/SKILL.md) and the write path is
[`add-a-mutation`](../add-a-mutation/SKILL.md). This is what changes when one has to run inside
the other. [`apps/api/src/categories`](../../../apps/api/src/categories) is the pattern in full.

## One transaction is not enough

The mutation opens at Postgres's default isolation, READ COMMITTED. A concurrent write to the
rows being summed is invisible to the sum, and the row the check protects is invisible to that
writer. Both transactions see a valid world and both commit, which is how a category ends up
hidden with money in it.

So the rows are taken under `SELECT ... FOR UPDATE` at the start of the mutation, through
[`ScopedRawRepository`](../../../apps/api/src/raw-sql/scoped-raw.repository.ts) on the
mutation's own client. The lock has to be in the statement; a plain read takes none.

**Both sides lock, or neither is protected.** A lock on the hide alone stops nothing: the write
it is racing has to take the same lock on the same rows, so `MovesService` locks the categories a
move names before it touches an assignment. When adding a second writer of those rows, that lock
is part of the change, not a follow-up.

**Lock the rows in a fixed order**, by id, the way `inLockOrder` and
[`inWriteOrder`](../../../apps/api/src/categories/write-order.ts) do. Two requests taking the
same rows in opposite orders deadlock, and the caller is handed a 500 for an operation nothing
was wrong with.

## The aggregate is the whole space, not the month on screen

The bound is over every month, because money assigned to a later one has already left the pool.
A sum bounded by the open month reads zero while the envelope is full, and the check passes on a
screen that shows nothing wrong. The statement therefore carries no month or date comparison at
all, and a unit test asserts that.

## What the refusal has to carry

The screen has to name the amount that blocked the write, so the refusal carries it as a string
of minor units beside its reason. Do not send a formatted amount: the digit count belongs to the
budget's currency and the screen already knows it.

The screen also needs that number **before** it asks, or the only way to learn a write will be
refused is to try it. That is why the month endpoint publishes the all-month sum next to the
month's own.

## Tests that are not optional

- the statement scopes by caller and budget in every branch, and bounds no month;
- the refusal on both signs, because a hidden debt is the same lost envelope as a hidden
  surplus;
- zero in the open month with money in a later one;
- the two racing requests fired together, asserting that they are never both accepted. Run it
  over several rounds: one round proves nothing about an interleaving.
