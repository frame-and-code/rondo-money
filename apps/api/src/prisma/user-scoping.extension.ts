import { type Prisma, type PrismaClient } from '@rondo/db';

import { type ActiveBudgetResolver } from '@/prisma/active-budget.resolver';
import {
  BUDGET_SCOPED_MODELS,
  MUTATION_GUARDED_MODELS,
  SCOPED_MODELS,
} from '@/prisma/scoped-models';
import { type RequestContextService } from '@/request-context/request-context.service';

interface RequestScope {
  userId: string;
  budgetId?: string;
}

function scopedWhere<A extends { where?: object }>(args: A, scope: RequestScope): A {
  return Object.assign({}, args, { where: Object.assign({}, args.where, scope) });
}

function scopedData<A extends { data: object }>(args: A, userId: string): A {
  return Object.assign({}, args, { data: Object.assign({}, args.data, { userId }) });
}

function isRowList(data: object | readonly object[]): data is readonly object[] {
  return Array.isArray(data);
}

function scopedRows<A extends { data: object | readonly object[] }>(args: A, userId: string): A {
  const { data } = args;

  return Object.assign({}, args, {
    data: isRowList(data)
      ? data.map((row) => Object.assign({}, row, { userId }))
      : Object.assign({}, data, { userId }),
  });
}

/// The `where` half picks out an existing row, so it carries the whole scope. The `create`
/// half takes its budget from the payload, the way every other row-creating write does.
function scopedUpsert<A extends { where: object; create: object; update: object }>(
  args: A,
  scope: RequestScope,
): A {
  return Object.assign({}, args, {
    where: Object.assign({}, args.where, scope),
    create: Object.assign({}, args.create, { userId: scope.userId }),
    update: Object.assign({}, args.update, { userId: scope.userId }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireMutation(
  model: Prisma.ModelName,
  operation: string,
  context: RequestContextService,
): void {
  if (!MUTATION_GUARDED_MODELS.has(model) || context.isInMutation()) {
    return;
  }

  throw new Error(
    `Refusing "${operation}" on ${model}: a domain write goes through the single mutation ` +
      'service, which puts the whole user operation and its idempotency key in one transaction.',
  );
}

async function scopeFor(
  model: Prisma.ModelName,
  operation: string,
  context: RequestContextService,
  resolveActiveBudget: ActiveBudgetResolver,
): Promise<RequestScope> {
  const userId = context.requireUserId();
  if (!BUDGET_SCOPED_MODELS.has(model)) {
    return { userId };
  }

  const budgetId = await context.budgetOnce(resolveActiveBudget);
  if (!budgetId) {
    throw new Error(
      `Refusing "${operation}" on ${model}: the request carries no active budget, so the ` +
        'operation would reach every budget the caller owns.',
    );
  }

  return { userId, budgetId };
}

const HANDLED_OPERATIONS: ReadonlySet<string> = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/// The operations that reach the catch-all today, both reads. Anything else arriving here is
/// an operation this file has no rule for, so it answers to the write guard rather than
/// slipping past it on a client upgrade.
const READ_FALLBACKS: ReadonlySet<string> = new Set(['aggregate', 'groupBy']);

function carriesScope(args: unknown, scope: RequestScope): boolean {
  if (!isRecord(args)) {
    return false;
  }

  const { where } = args;

  return (
    isRecord(where) &&
    where.userId === scope.userId &&
    (scope.budgetId === undefined || where.budgetId === scope.budgetId)
  );
}

/// The client built with `boundary` is the one domain code injects; the one built without it is
/// what a mutation opens its transaction from. So an operation reaching a boundary client while
/// a mutation is open was issued beside that mutation's transaction rather than in it: a write
/// would commit on its own and survive the rollback, and a read would answer from before the
/// transaction started. Both are refused, and by any operation rather than by a list of the
/// writes, so an operation a later Prisma release adds is refused too rather than missed.
export function withUserScoping(
  client: PrismaClient,
  context: RequestContextService,
  resolveActiveBudget: ActiveBudgetResolver,
  { boundary = false }: { boundary?: boolean } = {},
) {
  function requireTheMutationsClient(model: Prisma.ModelName, operation: string): void {
    if (!boundary || !context.isInMutation()) {
      return;
    }

    throw new Error(
      `Refusing "${operation}" on ${model}: it is running outside the transaction of the ` +
        'mutation that is open, because it was issued on the injected client. Use the client ' +
        'the mutation handed you.',
    );
  }

  return client.$extends({
    name: 'user-scoping',
    query: {
      $allModels: {
        async findMany({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async findFirst({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async findFirstOrThrow({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async findUnique({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async findUniqueOrThrow({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async count({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async create({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          return query(scopedData(args, context.requireUserId()));
        },

        async createMany({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          return query(scopedRows(args, context.requireUserId()));
        },

        async createManyAndReturn({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          return query(scopedRows(args, context.requireUserId()));
        },

        async update({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          const scope = await scopeFor(model, operation, context, resolveActiveBudget);
          return query(scopedData(scopedWhere(args, scope), scope.userId));
        },

        async updateMany({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          const scope = await scopeFor(model, operation, context, resolveActiveBudget);
          return query(scopedData(scopedWhere(args, scope), scope.userId));
        },

        async updateManyAndReturn({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          const scope = await scopeFor(model, operation, context, resolveActiveBudget);
          return query(scopedData(scopedWhere(args, scope), scope.userId));
        },

        async upsert({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          return query(
            scopedUpsert(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async delete({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async deleteMany({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          requireTheMutationsClient(model, operation);
          requireMutation(model, operation, context);
          return query(
            scopedWhere(args, await scopeFor(model, operation, context, resolveActiveBudget)),
          );
        },

        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model) || HANDLED_OPERATIONS.has(operation)) return query(args);
          requireTheMutationsClient(model, operation);

          if (!READ_FALLBACKS.has(operation)) {
            requireMutation(model, operation, context);
          }

          if (!carriesScope(args, await scopeFor(model, operation, context, resolveActiveBudget))) {
            throw new Error(
              `Refusing "${operation}" on ${model}: the operation has no scoping rule in ` +
                'user-scoping.extension.ts, so it would run without the caller and, on a ' +
                'model a budget owns, without the active budget.',
            );
          }

          return query(args);
        },
      },
    },
  });
}
