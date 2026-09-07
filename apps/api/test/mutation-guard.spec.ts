import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@rondo/db';

import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_a';
const OTHER = 'user_b';
const BUDGET = 'budget_a';

interface Captured {
  model?: string;
  operation: string;
  args: unknown;
}

interface NestedCreate {
  data: { userId: string; categories: { create: { userId: string }[] } };
}

function isNestedCreate(args: unknown): args is NestedCreate {
  if (typeof args !== 'object' || args === null || !('data' in args)) {
    return false;
  }

  const { data } = args;

  return typeof data === 'object' && data !== null && 'userId' in data && 'categories' in data;
}

const WRITES = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
] as const;

const noActiveBudget = (): Promise<undefined> => Promise.resolve(undefined);

describe('the marker that keeps a domain write inside the mutation service', () => {
  const context = new RequestContextService();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused' }),
  });

  const captured: Captured[] = [];
  const scoped = withUserScoping(client, context, noActiveBudget).$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args }) {
          captured.push({ model, operation, args });
          return Promise.resolve(null);
        },
      },
    },
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  beforeEach(() => {
    captured.length = 0;
  });

  const budgetRow = {
    userId: USER,
    name: 'Main',
    currency: 'USD',
    minorDigits: 2,
    timezone: 'Europe/Warsaw',
    active: true,
  };
  const groupRow = { userId: USER, budgetId: BUDGET, name: 'Living', sortOrder: 0 };
  const categoryRow = { ...groupRow, groupId: 'g1', name: 'Food' };
  const accountRow = { userId: USER, budgetId: BUDGET, name: 'Wallet', type: 'CASH' as const };
  const transactionRow = {
    userId: USER,
    budgetId: BUDGET,
    accountId: 'a1',
    date: new Date('2026-03-05T00:00:00Z'),
    amount: -500n,
    type: 'EXPENSE' as const,
  };
  const assignmentRow = {
    userId: USER,
    budgetId: BUDGET,
    categoryId: 'c1',
    month: new Date('2026-02-01T00:00:00Z'),
    amount: 1000n,
  };
  const targetRow = {
    userId: USER,
    budgetId: BUDGET,
    categoryId: 'c1',
    kind: 'CONTRIBUTE' as const,
    amount: 1000n,
    startMonth: new Date('2026-02-01T00:00:00Z'),
  };
  const paidRow = {
    userId: USER,
    budgetId: BUDGET,
    categoryId: 'c1',
    month: new Date('2026-02-01T00:00:00Z'),
  };
  const where = { id: 'r1' };

  const writesOf = (
    model: Prisma.ModelName,
  ): Record<(typeof WRITES)[number], () => Promise<unknown>> => {
    switch (model) {
      case Prisma.ModelName.Budget:
        return {
          create: () => scoped.budget.create({ data: budgetRow }),
          createMany: () => scoped.budget.createMany({ data: [budgetRow] }),
          createManyAndReturn: () => scoped.budget.createManyAndReturn({ data: [budgetRow] }),
          update: () => scoped.budget.update({ where, data: { name: 'x' } }),
          updateMany: () => scoped.budget.updateMany({ data: { name: 'x' } }),
          updateManyAndReturn: () => scoped.budget.updateManyAndReturn({ data: { name: 'x' } }),
          upsert: () => scoped.budget.upsert({ where, create: budgetRow, update: { name: 'x' } }),
          delete: () => scoped.budget.delete({ where }),
          deleteMany: () => scoped.budget.deleteMany({}),
        };
      case Prisma.ModelName.CategoryGroup:
        return {
          create: () => scoped.categoryGroup.create({ data: groupRow }),
          createMany: () => scoped.categoryGroup.createMany({ data: [groupRow] }),
          createManyAndReturn: () => scoped.categoryGroup.createManyAndReturn({ data: [groupRow] }),
          update: () => scoped.categoryGroup.update({ where, data: { name: 'x' } }),
          updateMany: () => scoped.categoryGroup.updateMany({ data: { name: 'x' } }),
          updateManyAndReturn: () =>
            scoped.categoryGroup.updateManyAndReturn({ data: { name: 'x' } }),
          upsert: () =>
            scoped.categoryGroup.upsert({ where, create: groupRow, update: { name: 'x' } }),
          delete: () => scoped.categoryGroup.delete({ where }),
          deleteMany: () => scoped.categoryGroup.deleteMany({}),
        };
      case Prisma.ModelName.Category:
        return {
          create: () => scoped.category.create({ data: categoryRow }),
          createMany: () => scoped.category.createMany({ data: [categoryRow] }),
          createManyAndReturn: () => scoped.category.createManyAndReturn({ data: [categoryRow] }),
          update: () => scoped.category.update({ where, data: { name: 'x' } }),
          updateMany: () => scoped.category.updateMany({ data: { name: 'x' } }),
          updateManyAndReturn: () => scoped.category.updateManyAndReturn({ data: { name: 'x' } }),
          upsert: () =>
            scoped.category.upsert({ where, create: categoryRow, update: { name: 'x' } }),
          delete: () => scoped.category.delete({ where }),
          deleteMany: () => scoped.category.deleteMany({}),
        };
      case Prisma.ModelName.Account:
        return {
          create: () => scoped.account.create({ data: accountRow }),
          createMany: () => scoped.account.createMany({ data: [accountRow] }),
          createManyAndReturn: () => scoped.account.createManyAndReturn({ data: [accountRow] }),
          update: () => scoped.account.update({ where, data: { name: 'x' } }),
          updateMany: () => scoped.account.updateMany({ data: { name: 'x' } }),
          updateManyAndReturn: () => scoped.account.updateManyAndReturn({ data: { name: 'x' } }),
          upsert: () => scoped.account.upsert({ where, create: accountRow, update: { name: 'x' } }),
          delete: () => scoped.account.delete({ where }),
          deleteMany: () => scoped.account.deleteMany({}),
        };
      case Prisma.ModelName.Transaction:
        return {
          create: () => scoped.transaction.create({ data: transactionRow }),
          createMany: () => scoped.transaction.createMany({ data: [transactionRow] }),
          createManyAndReturn: () =>
            scoped.transaction.createManyAndReturn({ data: [transactionRow] }),
          update: () => scoped.transaction.update({ where, data: { payee: 'x' } }),
          updateMany: () => scoped.transaction.updateMany({ data: { payee: 'x' } }),
          updateManyAndReturn: () =>
            scoped.transaction.updateManyAndReturn({ data: { payee: 'x' } }),
          upsert: () =>
            scoped.transaction.upsert({ where, create: transactionRow, update: { payee: 'x' } }),
          delete: () => scoped.transaction.delete({ where }),
          deleteMany: () => scoped.transaction.deleteMany({}),
        };
      case Prisma.ModelName.Assignment:
        return {
          create: () => scoped.assignment.create({ data: assignmentRow }),
          createMany: () => scoped.assignment.createMany({ data: [assignmentRow] }),
          createManyAndReturn: () =>
            scoped.assignment.createManyAndReturn({ data: [assignmentRow] }),
          update: () => scoped.assignment.update({ where, data: { amount: 1n } }),
          updateMany: () => scoped.assignment.updateMany({ data: { amount: 1n } }),
          updateManyAndReturn: () =>
            scoped.assignment.updateManyAndReturn({ data: { amount: 1n } }),
          upsert: () =>
            scoped.assignment.upsert({ where, create: assignmentRow, update: { amount: 1n } }),
          delete: () => scoped.assignment.delete({ where }),
          deleteMany: () => scoped.assignment.deleteMany({}),
        };
      case Prisma.ModelName.CategoryTarget:
        return {
          create: () => scoped.categoryTarget.create({ data: targetRow }),
          createMany: () => scoped.categoryTarget.createMany({ data: [targetRow] }),
          createManyAndReturn: () =>
            scoped.categoryTarget.createManyAndReturn({ data: [targetRow] }),
          update: () => scoped.categoryTarget.update({ where, data: { amount: 1n } }),
          updateMany: () => scoped.categoryTarget.updateMany({ data: { amount: 1n } }),
          updateManyAndReturn: () =>
            scoped.categoryTarget.updateManyAndReturn({ data: { amount: 1n } }),
          upsert: () =>
            scoped.categoryTarget.upsert({ where, create: targetRow, update: { amount: 1n } }),
          delete: () => scoped.categoryTarget.delete({ where }),
          deleteMany: () => scoped.categoryTarget.deleteMany({}),
        };
      case Prisma.ModelName.CategoryPaidMonth:
        return {
          create: () => scoped.categoryPaidMonth.create({ data: paidRow }),
          createMany: () => scoped.categoryPaidMonth.createMany({ data: [paidRow] }),
          createManyAndReturn: () =>
            scoped.categoryPaidMonth.createManyAndReturn({ data: [paidRow] }),
          update: () => scoped.categoryPaidMonth.update({ where, data: { categoryId: 'c2' } }),
          updateMany: () => scoped.categoryPaidMonth.updateMany({ data: { categoryId: 'c2' } }),
          updateManyAndReturn: () =>
            scoped.categoryPaidMonth.updateManyAndReturn({ data: { categoryId: 'c2' } }),
          upsert: () =>
            scoped.categoryPaidMonth.upsert({
              where,
              create: paidRow,
              update: { categoryId: 'c2' },
            }),
          delete: () => scoped.categoryPaidMonth.delete({ where }),
          deleteMany: () => scoped.categoryPaidMonth.deleteMany({}),
        };
      default:
        throw new Error(
          `No writes are spelled out for ${model}, so this spec would silently test another ` +
            'model instead. Add its case beside the others.',
        );
    }
  };

  const GUARDED = [
    Prisma.ModelName.Budget,
    Prisma.ModelName.CategoryGroup,
    Prisma.ModelName.Category,
    Prisma.ModelName.Account,
    Prisma.ModelName.Transaction,
    Prisma.ModelName.Assignment,
    Prisma.ModelName.CategoryTarget,
    Prisma.ModelName.CategoryPaidMonth,
  ];

  const inRequest = <T>(work: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(USER);
      context.setBudgetId(BUDGET);
      return await work();
    });

  const inMutation = <T>(work: () => Promise<T>): Promise<T> =>
    inRequest(() => context.runInMutation(work));

  describe.each(GUARDED)('%s', (model) => {
    it.each(WRITES)(
      'refuses "%s" outside a mutation, naming what it refused',
      async (operation) => {
        const write = writesOf(model)[operation];

        await expect(inRequest(write)).rejects.toThrow(
          new RegExp(`Refusing "${operation}" on ${model}[\\s\\S]*mutation`),
        );
        expect(captured).toEqual([]);
      },
    );

    it.each(WRITES)('lets "%s" through inside a mutation', async (operation) => {
      await inMutation(writesOf(model)[operation]);

      expect(captured.map((entry) => ({ model: entry.model, operation: entry.operation }))).toEqual(
        [{ model, operation }],
      );
    });
  });

  it('leaves the models the mutation service does not own alone', async () => {
    await inRequest(() => scoped.userSettings.create({ data: { userId: USER } }));
    await inRequest(() =>
      scoped.idempotencyKey.create({ data: { userId: USER, key: 'k', requestFingerprint: 'f' } }),
    );

    expect(captured.map((entry) => entry.model)).toEqual(['UserSettings', 'IdempotencyKey']);
  });

  it('leaves reads of a guarded model alone', async () => {
    await inRequest(async () => {
      await scoped.category.findMany();
      await scoped.transaction.count();
      await scoped.budget.findFirst();
      await scoped.assignment.findMany();
    });

    expect(captured.map((entry) => entry.operation)).toEqual([
      'findMany',
      'count',
      'findFirst',
      'findMany',
    ]);
  });

  it('refuses a write outside a mutation whether or not a budget was resolved', async () => {
    await expect(
      context.run(async () => {
        context.setUserId(USER);
        return await scoped.category.deleteMany({});
      }),
    ).rejects.toThrow(/mutation/);

    expect(captured).toEqual([]);
  });

  it('leaves a nested write carrying the owner the caller named, since it sees only the top level', async () => {
    await inMutation(() =>
      scoped.categoryGroup.create({
        data: {
          ...groupRow,
          categories: { create: [{ userId: OTHER, name: 'Food', sortOrder: 0 }] },
        },
      }),
    );

    const written = captured[0]?.args;
    if (!isNestedCreate(written)) {
      throw new Error(`The nested create never reached the driver: ${JSON.stringify(written)}`);
    }

    expect(written.data.userId).toBe(USER);
    expect(written.data.categories.create[0]?.userId).toBe(OTHER);
  });
});
