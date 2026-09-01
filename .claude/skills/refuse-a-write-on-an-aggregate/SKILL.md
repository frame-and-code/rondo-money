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

**A foreign key covers inserts and nothing else.** Correcting an account's opening balance is
refused while the account holds records of its own, and it locks the account row alone.
Inserting a transaction checks its foreign key against that same account row, and the check
takes a lock of its own on it, so a concurrent insert waits on the row the correction is holding
rather than slipping past the count. **Deleting a child row checks no key and takes no such
lock.** Archiving an account is the case that shows it: the archive is refused unless the
balance is exactly zero, and a delete landing at that moment moves the balance after the sum has
read it, leaving a closed account holding money nobody can reach. So the shortcut holds only
where every writer of the counted rows is an insert. Where a delete or an update can move the
bound, each of those paths takes the lock itself.

**A shared lock is enough on the writers of the counted rows.** Recording a transaction takes
`FOR SHARE` on the account it names, and the write refused by the sum takes `FOR UPDATE`. The
two modes conflict, so neither slips past the other, while a shared lock does not conflict with
itself and two ordinary writes on one account still run side by side. Giving every writer the
exclusive lock would serialise them all and buy nothing.

**A write that updates the locked row itself takes the exclusive lock up front.** Its own
`UPDATE` asks for one anyway, so a shared lock taken first would have to be upgraded, which is
the deadlock the next paragraph describes. Renaming an account therefore locks it exclusively
while recording a transaction on it does not, and the difference is which row the write lands
on rather than how important it is.

**One mode per row per transaction.** A path that takes the shared lock and then asks for the
exclusive one on the same row deadlocks against another path doing the same, and the caller is
handed a 500 for an operation nothing was wrong with. So a path that already holds a row
exclusively reads what it needs out of the row that lock returned, rather than asking for it a
second time.

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

The refusal carries whatever the screen has to name. Where the bound is a sum the reader can
act on, that is the amount that blocked the write, as a string of minor units beside the reason.
Do not send a formatted amount: the digit count belongs to the budget's currency and the screen
already knows it. Where the bound is a yes or a no, the reason is the whole answer: nothing
about an account's records helps a reader whose opening balance is settled.

The screen also needs the answer **before** it asks, or the only way to learn a write will be
refused is to try it. That is why the month endpoint publishes the all-month sum next to the
month's own, and why the accounts list says per account whether its opening balance still takes
a correction.

## Tests that are not optional

- the statement scopes by caller and budget in every branch, and bounds no month;
- the refusal on both signs, because a hidden debt is the same lost envelope as a hidden
  surplus;
- zero in the open month with money in a later one;
- the two racing requests fired together, asserting that they are never both accepted. Run it
  over several rounds: one round proves nothing about an interleaving.
