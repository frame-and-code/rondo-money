---
name: aggregate-query
description: Write a raw SQL aggregate in apps/api without walking around tenant scoping: what the repository supplies, what the service has to supply itself, how dates and money cross the boundary, and the tests that are not optional. Use when a screen needs numbers computed over many rows.
---

# A raw aggregate

The Prisma extension cannot express a budget aggregate, so these queries are hand-written SQL
and the isolation the extension gives everything else is **not** on this path (ADR-005). One
sum does not need any of it: a total per group over a single table is Prisma's own `groupBy`,
which the extension allows once the `where` names the caller and the budget, and
[`page-a-long-list`](../page-a-long-list/SKILL.md) covers that one. The
statement to copy is
[`budget-view.query.ts`](../../../apps/api/src/budget-view/budget-view.query.ts), with
[`budget-view.service.ts`](../../../apps/api/src/budget-view/budget-view.service.ts) beside it.
Read both; everything below is visible in them. An aggregate a **write** has to consult first is
a shape of its own, and
[`refuse-a-write-on-an-aggregate`](../refuse-a-write-on-an-aggregate/SKILL.md) holds what
changes when the statement runs inside a mutation.

## The scope is two ids, and only one of them arrives on its own

[`ScopedRawRepository`](../../../apps/api/src/raw-sql/scoped-raw.repository.ts) hands the
builder a scope carrying `userId`, taken from the request context, and refuses to run without
one. It supplies nothing else.

**The budget is the service's job.** It reads the caller's active budget through
`SCOPED_PRISMA` and answers 400 when there is none, the way
[`AccountsService`](../../../apps/api/src/accounts/accounts.service.ts) does, then passes the id
into the builder. A forgotten `budgetId` is not a leak: the sums simply collect every budget
the caller owns, and the screen shows numbers nobody can explain. That failure has its own
test, because a cross-tenant test cannot see it.

**Every branch of the statement carries both ids.** A statement that reads four tables scopes
four times. Anything less is a query where one table is filtered by the join it happens to sit
behind, which survives exactly until someone rewrites the join.

## Write the builder as a pure function

The builder takes the scope, the budget and the bounds, and returns `Prisma.Sql`. Nothing else.
That is what lets a unit test hold the statement and check the scoping without a database
([`budget-view-query.spec.ts`](../../../apps/api/test/budget-view-query.spec.ts)), and that test
is not a nicety: with the caller's own budget already excluding everybody else's rows, no
integration scenario can tell a statement scoped by user and budget from one scoped by budget
alone.

Two more things the unit test pins. The ids ride in `values` and never in `text`, so nothing is
interpolated into SQL. And the same builder called for another budget produces identical text,
so no part of the scope is baked in.

## What crosses the boundary, and in which shape

- **Money is `bigint`.** Cast every sum with `::bigint`, or Postgres answers `numeric` and the
  driver hands back something that is not an integer. It is serialized to a string at the edge
  by `serializeMoney`, never a JSON number.
- **A month window is a pair of calendar dates.** `Transaction.date` and `Assignment.month`
  carry no time, so the window is a plain date comparison and no timezone enters it.
- **An instant is an instant.** `hiddenAt` is a timestamp, so a comparison against it takes a
  real moment, computed by the service from the budget's timezone with `monthStartInstant`.
  Bounding a date column with that instant pulls the last day of the previous month into this
  one, and no test that only spends money mid-month will notice.
- **One statement per screen.** A screen that costs a query per category is an N+1 that grows
  with the user's budget. The tests that hold this count the calls on the real repository, and
  every statement the screen sends at the driver
  ([`testing-patterns`](../testing-patterns/SKILL.md)).
- **A total over the rows rides on every row.** A statement answering a list and a sum over the
  same rows starts from the total and joins the rows onto it
  ([`account-balances.query.ts`](../../../apps/api/src/accounts/account-balances.query.ts)), so a
  caller holding nothing still gets one row and the service reads a zero total off it instead of
  inventing one. A second statement for the total is a second scoping to get right, and an inner
  join answers an empty budget with no rows at all.
- **A sum another statement already computes is composed, never written a second time.** The
  builder that owns it exports the part both need as a function returning `Prisma.Sql`, and the
  other statement embeds it
  ([`net-worth.query.ts`](../../../apps/api/src/net-worth/net-worth.query.ts) takes the account
  balance from `openAccountBalances`). Two copies of one sum are two screens that disagree the
  day one of them changes. The unit test holds it: the composed statement's `sql` contains the
  fragment's.

## The statement reads through an index

A sum over a budget reads every row the budget holds, and the index decides whether it reads the
table as well. One that starts with the caller and the budget, goes on with the column the
statement groups or ranges by and ends with the columns it sums lets Postgres answer from the
index alone, in the order the grouping wants: the plan says `Index Only Scan`, `Heap Fetches: 0`
and `GroupAggregate`. The indexes on `Transaction` in
[`schema.prisma`](../../../packages/db/prisma/schema.prisma) are the worked example, and why the
summed columns are key columns is in [`packages/db`](../../../packages/db/README.md). A new
aggregate either fits one of them or brings its own index in the same change.

An estimate is part of the plan. A filter on the caller and the budget is estimated through the
dependency statistic each budget table carries
([`packages/db`](../../../packages/db/README.md)); without it Postgres expects a fraction of the
rows, puts the sum inside a nested loop and runs it once per outer row.

Check the plan against volume, not against a fixture:

1. `pnpm --filter @rondo/db db:volume` writes a heavy budget among many lighter ones into the
   local database. How to open it in the app and remove it again is in
   [`packages/db`](../../../packages/db/README.md).
2. To see what a screen really sends, load `auto_explain` for the local database:
   `ALTER DATABASE rondo_dev SET session_preload_libraries = 'auto_explain'`, then
   `auto_explain.log_min_duration = 0`, `auto_explain.log_analyze = on` and
   `auto_explain.log_buffers = on` the same way, after a `LOAD 'auto_explain'` in that session
   so a misspelt setting is refused. Restart the api so its pool reconnects, open the screen,
   and read the plans in `docker compose logs postgres`.
3. `RESET` every one of those settings and restart the api again. The same database serves the
   integration tests, and the instrumentation slows every statement they run.
4. Run `VACUUM ANALYZE` before reading a plan, because an index-only scan needs the visibility
   map. Take timings in a pass of their own, without `auto_explain`.
5. Judge an index by the statement's `Execution Time` and `Buffers` in
   `EXPLAIN (ANALYZE, BUFFERS)`, not by the endpoint's response time, which the framework and
   the JSON body blur. An index the plan does not pick, or picks without the time falling, is
   a write cost with nothing bought.

## The tests that are not optional

- **Cross-tenant**, because this path bypasses the extension: another caller's rows reach
  neither the totals nor the list ([api](../../rules/api.md)). Copy
  [`budget-view-scoping.integration.spec.ts`](../../../apps/api/test/budget-view-scoping.integration.spec.ts).
- **The second budget of the same caller**, which the cross-tenant test cannot catch, in that
  same file.
- **The zero cases**, which are where a join written as an inner one loses rows: a row with an
  assignment and no transaction, one with a transaction and no assignment, one with neither
  ([`budget-view.integration.spec.ts`](../../../apps/api/test/budget-view.integration.spec.ts)).

## Inside a mutation

A raw statement issued on the pooled client would land beside the mutation's transaction rather
than in it. So inside one, pass the client the mutation handed you, and what each half refuses
is in [api](../../rules/api.md).
