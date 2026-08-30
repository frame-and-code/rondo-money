---
name: pick-the-active-row
description: Keep a history of rows where a screen expects one, and pick the right one per month without duplicating what the aggregate returns. Use when a model gets a lifetime instead of a single row, such as a category goal or any setting that changes and has to keep what it was.
---

# One row out of a history

A model that used to be one row per parent grows a history: the new row does not overwrite
the old one, and which row a month reads is decided by the window each row carries. That
change is small in the schema and large everywhere else, and this is what it costs.

[`CategoryTarget`](../../../packages/db/prisma/schema.prisma) is the model to copy, and
[`target-window.ts`](../../../apps/api/src/categories/target-window.ts) is where its two
predicates live.

## The read predicate and the write predicate are not the same one

A row is **shown** in a month when the month falls inside its window: it started no later
than that month, and neither its ending marker nor its due marker is earlier. A row is
**live for a write** only while it has no ending marker at all.

The difference is the last month an ended row is shown in, whether the user closed it there
or a replacement starts the month after. That month still shows the row, and it no longer
accepts an edit, because the row is over. Reuse one predicate for both and a write in that
month edits a row nobody can reach any more.

Both predicates take the whole history and answer with the last row started, so an accidental
overlap resolves the same way on both sides rather than differently.

## The aggregate picks one row, and an index cannot do it for you

The screen reads every parent in one statement, so the history has to collapse to one row per
parent before it is joined. That is `DISTINCT ON (parent_id) ... ORDER BY parent_id,
start_month DESC` in a CTE of its own, and a unique index no longer protects you: the schema
allows many rows per parent on purpose.

Get this wrong and the parent row multiplies. Nothing errors: the screen lists the category
twice and the group's total doubles.

## A sum over the window is joined from the window, never the other way round

A CTE that groups the facts (`FROM assignment ... GROUP BY category_id`) contains only parents
that have at least one fact. Hang the window's own sum on it and a parent with a row and no
facts loses the row entirely, which is the state right after the user creates one.

So the sum starts from the window and reaches for the facts:

```sql
FROM active_target t
LEFT JOIN assignment a
  ON a.category_id = t.category_id
  AND a.user_id = $1 AND a.budget_id = $2
GROUP BY t.category_id
```

Both ids on the join, because the raw path has no scoping extension behind it
([aggregate-query](../aggregate-query/SKILL.md)).

**A window that needs several sums cuts them with `FILTER`, not with the join.** Move a bound
into the `ON` and the rows it excludes are gone for every other sum in that CTE, so a second
sum over a different span silently reads the first one's rows. Each sum states its own span:
`SUM(a.amount) FILTER (WHERE a.month >= t.start_month AND a.month <= $3)` beside
`SUM(a.amount) FILTER (WHERE a.month < t.start_month)`. Two different tables still take two
CTEs, because one join of each would multiply the rows of both.

Leave the existing fact CTEs alone. In `budget-view` the pool that answers ready to assign is
computed from one of them, so changing which rows it holds moves a number on every screen and
no test about the new model would see it.

## The write takes the parent's lock before it reads the history

Choosing a branch means reading the history and then writing, which two requests can do at
once. The unique key on the pair of parent and starting month turns the loser into a
`P2002`, and the mutation service reads any `P2002` as an idempotency-key conflict: it rolls
back, finds no claim, and rethrows the raw Prisma error as a 500.

So lock the parent row first, inside the transaction, the way
[refuse-a-write-on-an-aggregate](../refuse-a-write-on-an-aggregate/SKILL.md) does, and choose
the branch after the lock is held.

## The tests that are not optional

- both predicates, over the same history: the month before the first row, a month between one
  that ended and the next, the month of the ending marker and the one after it;
- every write branch by name, as a pure function, before any of it reaches the database;
- one parent with a history comes back from the aggregate exactly once;
- a parent with a row and no facts still carries it;
- two writes at once leave one row, both answering success;
- cross-tenant on the new table and on the new join, because the aggregate bypasses the
  extension.
