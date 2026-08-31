---
name: page-a-long-list
description: Answer a list endpoint one page at a time with a keyset cursor, and let the screen ask for the next page as the reader reaches the end. Use when a screen shows a list that grows without a bound. Filters and per-group totals are part of it.
---

# Page a long list

A list that grows without a bound is read a page at a time, and the page after it is asked for
by a cursor rather than by an offset. `OFFSET` re-counts every skipped row and, worse, shifts
under a write: a record added while the reader scrolls pushes one row onto the next page, where
it is read twice, and another off it, where it is never read at all.
[`apps/api/src/transactions`](../../../apps/api/src/transactions) is the worked example, and
[`money-flow.tsx`](../../../apps/web/src/components/money-flow.tsx) is the screen.

## The cursor names a row, not a position

Order by a tuple that is total, and cut on the same tuple. Two of the three columns of a feed
repeat, so the third is the tie-breaker that makes the order total: the day, the moment the row
was written, and its id. `uuid(7)` sorts by creation, so it breaks a tie the way a reader
expects.

```ts
orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
take: limit + 1,
where: { AND: [filter, olderThan(cursor)] },
```

`olderThan` is the tuple written out, and every branch of it is required:

```ts
OR: [
  { date: { lt: cursor.date } },
  { date: cursor.date, createdAt: { lt: cursor.createdAt } },
  { date: cursor.date, createdAt: cursor.createdAt, id: { lt: cursor.id } },
];
```

Three rules the shape rests on:

- **`take: limit + 1` is how the answer knows there is more.** Slice the extra row off, and let
  `nextCursor` be null when it was not there. A separate count query answers a different
  question and costs a scan.
- **The cursor is opaque to the client and total to the database.** Encode the tuple, do not
  publish three parameters. A screen that assembles a cursor is a screen that will assemble a
  wrong one.
- **Name the parameter `cursor`.** The generated client only produces `...InfiniteOptions` for a
  parameter whose name is one of `after`, `before`, `cursor`, `offset`, `page` or `start`
  (`defaultPaginationKeywords` in `@hey-api/shared`). Call it anything else and the screen has
  to hand-write what the generator would have given it.
- **Every way into the list gets its own index, and each carries its filter columns then the
  leading keys of the sort.** The worked example has two: one for the feed of a single account
  and one for the feed across all of them, where the first index's leading column is unbound and
  therefore useless. The tie-breaking id stays out of both: it costs an entry per row and saves
  an incremental sort over rows that already share a day and a moment. `EXPLAIN` says
  `Presorted Key: date, created_at` on both paths, which is the shape to check for.

## A filter belongs to the query, never to the loaded rows

Under infinite scrolling the browser holds a prefix of the answer, so filtering what is loaded
answers about that prefix and calls it the whole. Every filter is a parameter, they narrow
together, and changing one asks the server again from the first page.

## A total that spans a page is computed on the server

A heading over a group of rows (a day's total, a month's) is not the sum of the rows on this
page: a group cut by a page boundary would read differently on each side, and the number would
move as the reader scrolls. Answer with the total of the whole group under the same filter,
computed for the groups the page touches:

```ts
groupBy({
  by: ['date'],
  where: { ...filter, date: { gte: last.date, lte: first.date } },
  _sum: { amount: true },
});
```

`groupBy` has no scoping rule of its own, so the `where` names the caller and the budget
explicitly or the extension refuses it (see [security](../../rules/security.md)).

## What the tests have to prove

- **the boundary**: three pages of two rows over five records lose none and repeat none;
- **the group total across that boundary**: the same number on both pages, equal to the whole
  group;
- **each filter alone and two together**;
- **the cross-tenant read**, because a list endpoint is the widest read in the app.
