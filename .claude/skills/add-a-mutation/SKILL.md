---
name: add-a-mutation
description: Write a domain mutation in apps/api, with its transaction, its idempotency key and the tests that are not optional. Use when a feature changes money data: creating a budget with its categories, adding or editing a transaction, moving money between envelopes, renaming or archiving. The read path is a different skill.
---

# Add a mutation

Every write to a model in `MUTATION_GUARDED_MODELS`
([`scoped-models.ts`](../../../apps/api/src/prisma/scoped-models.ts)) goes through
[`MutationService`](../../../apps/api/src/mutations/mutation.service.ts). This is not advice. The scoping extension throws on a write that is not inside
one, so a service that reaches for `SCOPED_PRISMA` directly fails its first test rather than
shipping. Two models sit beside that list on purpose: a user's settings, which their own first
read creates, and the idempotency key, which this service writes on its own transaction.

Read [`mutation.service.ts`](../../../apps/api/src/mutations/mutation.service.ts) alongside
this file. It is one method, and every rule below is visible in it.

## Before writing anything

1. Read the phase ticket and the ADRs covering the area. What is already decided is not yours
   to re-derive.
2. Decide what **one user operation** means here. That is the unit that must be atomic, and it
   is a product question, not a technical one: a transfer is two rows and one operation, a
   budget with its default categories is many rows and one operation.

## The shape

```ts
const created = await this.mutations.run(
  { key: body.idempotencyKey, request: body, decode: decodeAccount },
  async (tx) => {
    const account = await tx.account.create({ data: { userId, budgetId, ...} });
    await tx.transaction.create({ data: { userId, budgetId, accountId: account.id, ... } });
    return serializeAccount(account);
  },
);
```

- **`work` receives the transactional client and uses nothing else.** Any query issued on the
  injected `SCOPED_PRISMA` inside `work` is **refused**, a read as much as a write; what the
  boundary between the two clients covers is in [security](../../rules/security.md).
- **Await everything, because the boundary stops at the mutation's own lifetime.** A promise
  the mutation never awaits settles after the marker is gone, and from there the two halves
  part company. A write is still refused, by the guard that keeps a domain write inside a
  mutation at all, though far too late to be of use. A read is not refused by anything: it runs
  on the pooled connection and answers from outside the transaction it thinks it is in.
- **Parent ids go in as flat scalars, never `connect`.** The composite budget relation made
  `userId` a relation scalar, so Prisma's checked create input no longer carries it while the
  unchecked one does. The extension stamps `userId` onto every payload, which turns a
  `connect`-form write into an object matching neither, and Prisma rejects it at runtime with
  the types having said nothing.
- **Compose, do not nest.** A `run` inside another `run` is refused, because Postgres has no
  nested interactive transaction and the inner one would commit on its own and claim a second
  key. A mutation that wants another one's steps calls a plain function that takes `tx`.
- **The result is JSON.** `work` returns a `Prisma.JsonValue`, which is what the idempotency row
  stores. Money is `bigint` and is therefore serialized on the way in (`serializeMoney`) and
  parsed on the way out, by the `decode` the caller passes. `decode` runs on both paths, the
  fresh one and the replay, so the two cannot drift.
- **`decode` narrows, it never casts.** The stored row is `Prisma.JsonValue`, and a cast there
  would promise the caller a shape the row may not carry. Write a guard that throws on a shape
  it does not recognise, and let it propagate.
- **Raw SQL takes the transactional client**: `raw.execute(build, tx)` to write,
  `raw.query(build, tx)` to read. Inside a mutation neither runs without it, and what each
  refuses is in [security](../../rules/security.md).

## The idempotency key

The key belongs to the **user's intent**. The client mints it once when the form opens, not per
HTTP request, or a double click writes twice and the whole construction is decoration.

What the service does with it, and why the order matters:

1. The key row is claimed **first**, inside the transaction. A concurrent duplicate blocks on
   the unique index instead of doing the work a second time.
2. The work runs, and its result is written onto that row before the transaction commits.
3. A repeat hits the unique index. That conflict rolls back the **whole** transaction, so the
   stored result cannot be read inside it. The service reads it afterwards, on a separate
   query, and answers with it.
4. A repeat whose request fingerprint differs is refused rather than replayed, for the reason
   [architecture](../../rules/architecture.md) gives.

A mutation that fails leaves no key row, so an honest retry goes through. And a user who
enters the same coffee twice gets two transactions, which is correct: the key catches a
resubmitted intent, not a repeated one.

## Scoping still applies, unchanged

The extension stamps the caller onto every write and filters the writes that pick out existing
rows. Two things it does not do, and one of them is now the schema's job:

- it never verifies that a `budgetId`, `accountId` or `categoryId` in the payload belongs to
  the caller. The composite foreign keys refuse a child naming a parent from another budget or
  another owner ([`packages/db`](../../../packages/db/README.md)), so this is a failed write
  rather than a leak. A mutation that wants a friendlier answer than a foreign-key error reads
  the parent first, inside the transaction;
- it does not reach a nested write, which keeps whatever owner the payload put on the nested
  rows. Where that boundary runs is [security](../../rules/security.md); write the rows as
  separate operations inside the same transaction and it does not arise.

A write that creates rows takes its budget from the payload and needs no active budget in the
context, which is what lets the first budget of a user be created at all.

## The tests, in the same change

Levels and commands are in [`docs/testing.md`](../../../docs/testing.md); how to write one here
is [`testing-patterns`](../testing-patterns/SKILL.md). The minimum for a mutation, all
integration, copied from
[`mutation.integration.spec.ts`](../../../apps/api/test/mutation.integration.spec.ts):

- every row of the composite operation is written;
- a failure part way through leaves **none** of them, the key row included;
- a repeat of the key does not apply it twice and answers with the first result;
- two requests carrying one key, side by side, apply it once;
- a second user holding the same key is unaffected (cross-tenant, mandatory);
- the caller cannot reach another user's rows through the mutation.

From the phase that adds aggregates, invariant 5.5 is asserted over all-time aggregates after
every operation, property-based. A mutation that moves money without that test is not done.
