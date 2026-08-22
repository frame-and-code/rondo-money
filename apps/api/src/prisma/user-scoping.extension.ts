import { type PrismaClient } from '@rondo/db';

import { SCOPED_MODELS } from '@/prisma/scoped-models';
import { type RequestContextService } from '@/request-context/request-context.service';

function scopedWhere<W extends object | undefined>(where: W, userId: string) {
  return { ...where, userId };
}

function scopedData<D extends object | undefined>(data: D, userId: string) {
  return { ...data, userId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function carriesScope(args: unknown, userId: string): boolean {
  if (!isRecord(args)) {
    return false;
  }

  if (isRecord(args.where) && args.where.userId === userId) {
    return true;
  }

  const { data } = args;
  if (Array.isArray(data)) {
    return data.every((row) => isRecord(row) && row.userId === userId);
  }

  return isRecord(data) && data.userId === userId;
}

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
