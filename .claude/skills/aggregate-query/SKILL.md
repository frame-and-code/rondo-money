---
name: aggregate-query
description: Write a raw SQL aggregate in apps/api without walking around tenant scoping: what the repository supplies, what the service has to supply itself, how dates and money cross the boundary, and the tests that are not optional. Use when a screen needs numbers computed over many rows.
---

# A raw aggregate

The Prisma extension cannot express a budget aggregate, so these queries are hand-written SQL
and the isolation the extension gives everything else is **not** on this path (ADR-005). The
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
  with the user's budget. The test that holds this counts the calls on the real repository.

## The tests that are not optional

- **Cross-tenant**, because this path bypasses the extension: another caller's rows reach
  neither the totals nor the list ([security](../../rules/security.md)). Copy
  [`budget-view-scoping.integration.spec.ts`](../../../apps/api/test/budget-view-scoping.integration.spec.ts).
- **The second budget of the same caller**, which the cross-tenant test cannot catch, in that
  same file.
- **The zero cases**, which are where a join written as an inner one loses rows: a row with an
  assignment and no transaction, one with a transaction and no assignment, one with neither
  ([`budget-view.integration.spec.ts`](../../../apps/api/test/budget-view.integration.spec.ts)).

## Inside a mutation

A raw statement issued on the pooled client would land beside the mutation's transaction rather
than in it. So inside one, pass the client the mutation handed you, and what each half refuses
is in [security](../../rules/security.md).
