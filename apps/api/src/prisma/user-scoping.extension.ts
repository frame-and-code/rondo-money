import { type PrismaClient } from '@rondo/db';

import { SCOPED_MODELS } from '@/prisma/scoped-models';
import { type RequestContextService } from '@/request-context/request-context.service';

/**
 * Adds the caller's `userId` to a `where`. Ours goes **last** on purpose: a caller passing
 * `where: { userId: someoneElse }` is overwritten rather than obeyed.
 */
function scopedWhere<W extends object | undefined>(where: W, userId: string) {
  return { ...where, userId };
}

/**
 * Stamps ownership on written data. Also applied to `update` payloads, where it is not
 * about reading someone else's row but about handing one over: without it,
 * `update({ data: { userId: victim } })` would move a row we own into another user's data.
 */
function scopedData<D extends object | undefined>(data: D, userId: string) {
  return { ...data, userId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Does this operation's arguments actually carry our `userId`?
 *
 * This is what makes the catch-all below a real backstop instead of a list of names to keep
 * in sync: it checks the *outcome* of the rules above, so an operation with no rule at all
 * (`aggregate`, `groupBy`) and a rule that forgot to scope both fail the same way.
 */
function carriesScope(args: unknown, userId: string): boolean {
  if (!isRecord(args)) {
    return false;
  }

  if (isRecord(args.where) && args.where.userId === userId) {
    return true;
  }

  const { data } = args;
  if (Array.isArray(data)) {
    // createMany: every row carries the caller, and an empty batch trivially does — filtering
    // a list down to nothing is a legal no-op, not an attempt to escape the scope.
    return data.every((row) => isRecord(row) && row.userId === userId);
  }

  return isRecord(data) && data.userId === userId;
}

/**
 * Auto-scoping for every registered model: reads are filtered by the caller's `userId`,
 * writes are stamped with it, and anything the rules do not cover is refused.
 *
 * This is the third link of the isolation chain from ADR-005 — the one that means a domain
 * module writes an ordinary `findMany()` and cannot physically read another user's rows.
 * Three limits worth knowing before trusting it:
 *
 * - it covers the model API only. `$queryRaw` / `$executeRaw` are **not** intercepted, which
 *   is why raw SQL lives behind `ScopedRawRepository` and a lint rule keeps it there;
 * - it acts on models listed in `SCOPED_MODELS`, so a new table is unprotected until it is
 *   registered — see that file for how forgetting is caught;
 * - it sees **top-level operations only**. A nested write — `create({ data: { legs: { create:
 *   [...] } } })` — keeps whatever `userId` the caller put on the nested rows, and the backstop
 *   below cannot tell, because it inspects that same top-level `data`. Unreachable today (one
 *   model, no relations), but it is the shape F3.2 writes a transfer's two legs in: scope the
 *   nested rows explicitly there, or create them as separate top-level writes inside the
 *   transaction.
 *
 * Written as `client.$extends(...)` rather than a free-standing `Prisma.defineExtension`
 * object: only the client-bound form carries the schema's type map into the hooks. Detached,
 * every `args` degrades to `never` and the rules below stop compiling.
 */
export function withUserScoping(client: PrismaClient, context: RequestContextService) {
  return client.$extends({
    name: 'user-scoping',
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        async findFirst({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        async findFirstOrThrow({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        // `findUnique` accepts non-unique fields beside the unique one (Prisma's extended
        // `where unique`), so the id lookup keeps its index and still cannot cross tenants.
        async findUnique({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        async findUniqueOrThrow({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        async count({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        async create({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, data: scopedData(args.data, context.requireUserId()) });
        },

        async createMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          const { data } = args;
          return query({
            ...args,
            data: Array.isArray(data)
              ? data.map((row) => scopedData(row, userId))
              : scopedData(data, userId),
          });
        },

        async update({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          return query({
            ...args,
            where: scopedWhere(args.where, userId),
            data: scopedData(args.data, userId),
          });
        },

        async updateMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          return query({
            ...args,
            where: scopedWhere(args.where, userId),
            data: scopedData(args.data, userId),
          });
        },

        async upsert({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          return query({
            ...args,
            where: scopedWhere(args.where, userId),
            create: scopedData(args.create, userId),
            update: scopedData(args.update, userId),
          });
        },

        async delete({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        async deleteMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query({ ...args, where: scopedWhere(args.where, context.requireUserId()) });
        },

        /**
         * The backstop. Prisma runs this for **every** operation on top of the rules above
         * (verified: `findMany` traces as `named:findMany` then `catch-all:findMany`), so it
         * sees the arguments a rule already produced — and refuses anything that arrives at
         * a registered model without our `userId` on it. That covers the operations with no
         * rule of their own, which is why `aggregate` and `groupBy` cannot quietly read
         * across tenants until someone scopes them deliberately.
         */
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);

          const userId = context.requireUserId();
          if (!carriesScope(args, userId)) {
            throw new Error(
              `Refusing "${operation}" on ${model}: the operation has no scoping rule in ` +
                'user-scoping.extension.ts, so it would run without a userId filter.',
            );
          }

          return query(args);
        },
      },
    },
  });
}
