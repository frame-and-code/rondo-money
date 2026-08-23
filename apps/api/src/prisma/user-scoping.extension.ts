import { type Prisma, type PrismaClient } from '@rondo/db';

import { BUDGET_SCOPED_MODELS, SCOPED_MODELS } from '@/prisma/scoped-models';
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

function scopedUpsert<A extends { where: object; create: object; update: object }>(
  args: A,
  userId: string,
): A {
  return Object.assign({}, args, {
    where: Object.assign({}, args.where, { userId }),
    create: Object.assign({}, args.create, { userId }),
    update: Object.assign({}, args.update, { userId }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readScope(
  model: Prisma.ModelName,
  operation: string,
  context: RequestContextService,
): RequestScope {
  const userId = context.requireUserId();
  if (!BUDGET_SCOPED_MODELS.has(model)) {
    return { userId };
  }

  const budgetId = context.readBudgetId();
  if (!budgetId) {
    throw new Error(
      `Refusing "${operation}" on ${model}: the request carries no active budget, so the ` +
        'read would answer across every budget the caller owns.',
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

export function withUserScoping(client: PrismaClient, context: RequestContextService) {
  return client.$extends({
    name: 'user-scoping',
    query: {
      $allModels: {
        async findMany({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, readScope(model, operation, context)));
        },

        async findFirst({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, readScope(model, operation, context)));
        },

        async findFirstOrThrow({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, readScope(model, operation, context)));
        },

        async findUnique({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, readScope(model, operation, context)));
        },

        async findUniqueOrThrow({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, readScope(model, operation, context)));
        },

        async count({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, readScope(model, operation, context)));
        },

        async create({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedData(args, context.requireUserId()));
        },

        async createMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedRows(args, context.requireUserId()));
        },

        async createManyAndReturn({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedRows(args, context.requireUserId()));
        },

        async update({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          return query(scopedData(scopedWhere(args, { userId }), userId));
        },

        async updateMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          return query(scopedData(scopedWhere(args, { userId }), userId));
        },

        async updateManyAndReturn({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const userId = context.requireUserId();
          return query(scopedData(scopedWhere(args, { userId }), userId));
        },

        async upsert({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedUpsert(args, context.requireUserId()));
        },

        async delete({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, { userId: context.requireUserId() }));
        },

        async deleteMany({ model, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          return query(scopedWhere(args, { userId: context.requireUserId() }));
        },

        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model) || HANDLED_OPERATIONS.has(operation)) return query(args);

          if (!carriesScope(args, readScope(model, operation, context))) {
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
