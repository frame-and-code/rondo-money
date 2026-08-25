import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@rondo/db';
import { MONEY_MAX, MONEY_MIN, calendarMonthOf, toDbMonth } from '@rondo/types';

import { AppModule } from '@/app.module';
import { MutationService } from '@/mutations/mutation.service';
import { PrismaService } from '@/prisma/prisma.service';
import { MUTATOR_PRISMA, type MutatorPrismaClient } from '@/prisma/scoped-prisma';
import { RequestContextService } from '@/request-context/request-context.service';

const USER = 'user_2rondoAssignmentAaaaaaaaaa';
const OTHER_USER = 'user_2rondoAssignmentBbbbbbbbbb';
const OWNERS = { userId: { in: [USER, OTHER_USER] } };

const codeOf = (error: unknown): string | undefined =>
  error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;

describe('the assignment table (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scoped: MutatorPrismaClient;
  let mutations: MutationService;
  let context: RequestContextService;

  let budget: { id: string };
  let otherBudget: { id: string };
  let budgetOfOtherUser: { id: string };
  let category: { id: string };
  let categoryOfOtherBudget: { id: string };

  const inMutation = <T>(work: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(USER);
      context.setBudgetId(budget.id);
      return await context.runInMutation(work);
    });

  const asUser = <T>(work: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(USER);
      return await work();
    });

  const removeFixtures = async (): Promise<void> => {
    await prisma.assignment.deleteMany({ where: OWNERS });
    await prisma.category.deleteMany({ where: OWNERS });
    await prisma.categoryGroup.deleteMany({ where: OWNERS });
    await prisma.idempotencyKey.deleteMany({ where: OWNERS });
    await prisma.budget.deleteMany({ where: OWNERS });
  };

  const createBudget = (userId: string, active: boolean) =>
    prisma.budget.create({
      data: {
        userId,
        name: 'Main',
        currency: 'USD',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active,
      },
    });

  const createCategory = async (userId: string, budgetId: string, name: string) => {
    const group = await prisma.categoryGroup.create({
      data: { userId, budgetId, name: `${name} group`, sortOrder: 0 },
    });

    return prisma.category.create({
      data: { userId, budgetId, groupId: group.id, name, sortOrder: 0 },
    });
  };

  const assign = (data: { categoryId: string; month: Date; amount: bigint; budgetId?: string }) =>
    prisma.assignment.create({
      data: {
        userId: USER,
        budgetId: data.budgetId ?? budget.id,
        categoryId: data.categoryId,
        month: data.month,
        amount: data.amount,
      },
    });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    scoped = app.get<MutatorPrismaClient>(MUTATOR_PRISMA);
    mutations = app.get(MutationService);
    context = app.get(RequestContextService);
  });

  afterAll(async () => {
    if (app) {
      await removeFixtures();
      await app.close();
    }
  });

  beforeEach(async () => {
    await removeFixtures();

    budget = await createBudget(USER, true);
    otherBudget = await createBudget(USER, false);
    budgetOfOtherUser = await createBudget(OTHER_USER, true);
    category = await createCategory(USER, budget.id, 'Food');
    categoryOfOtherBudget = await createCategory(USER, otherBudget.id, 'Old food');
  });

  it('stores the month as a calendar date, so a value carrying a time lands on its day', async () => {
    const created = await assign({
      categoryId: category.id,
      month: new Date('2026-02-01T13:45:00Z'),
      amount: 1000n,
    });

    const stored = await prisma.assignment.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.month.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(calendarMonthOf(stored.month)).toBe('2026-02');
  });

  it('holds one row per category and month, refusing the second on that index', async () => {
    await assign({ categoryId: category.id, month: toDbMonth('2026-02'), amount: 1000n });

    const conflict = await assign({
      categoryId: category.id,
      month: toDbMonth('2026-02'),
      amount: 2000n,
    }).catch((error: unknown) => error);

    expect(codeOf(conflict)).toBe('P2002');
    expect(String(conflict)).toContain(
      'Unique constraint failed on the fields: (`category_id`, `month`)',
    );
  });

  it('refuses a month that is not the first of its month, so the pair is unique per month', async () => {
    await assign({ categoryId: category.id, month: toDbMonth('2026-02'), amount: 1000n });

    const refused = await assign({
      categoryId: category.id,
      month: new Date('2026-02-15T00:00:00Z'),
      amount: 2000n,
    }).catch((error: unknown) => error);

    expect(String(refused)).toContain('assignment_month_is_first_of_month');
    expect(await prisma.assignment.count({ where: { userId: USER } })).toBe(1);
  });

  it('keys on the pair rather than on either half, across the year boundary too', async () => {
    const second = await createCategory(USER, budget.id, 'Transport');

    await assign({ categoryId: category.id, month: toDbMonth('2025-12'), amount: 100n });
    await assign({ categoryId: category.id, month: toDbMonth('2026-01'), amount: 200n });
    await assign({ categoryId: second.id, month: toDbMonth('2026-01'), amount: 300n });

    expect(await prisma.assignment.count({ where: { userId: USER } })).toBe(3);
  });

  it('takes a negative amount and a zero, and hands both back as bigint', async () => {
    const negative = await assign({
      categoryId: category.id,
      month: toDbMonth('2026-02'),
      amount: -500n,
    });
    const zero = await assign({
      categoryId: category.id,
      month: toDbMonth('2026-03'),
      amount: 0n,
    });

    const stored = await prisma.assignment.findMany({
      where: { id: { in: [negative.id, zero.id] } },
      orderBy: { month: 'asc' },
    });

    expect(stored.map((row) => row.amount)).toEqual([-500n, 0n]);
    expect(typeof stored[0]?.amount).toBe('bigint');
  });

  it('round-trips both ends of the range past what a JavaScript number can hold', async () => {
    const low = await assign({
      categoryId: category.id,
      month: toDbMonth('2026-02'),
      amount: MONEY_MIN,
    });
    const high = await assign({
      categoryId: category.id,
      month: toDbMonth('2026-03'),
      amount: MONEY_MAX,
    });

    const stored = await prisma.assignment.findMany({
      where: { id: { in: [low.id, high.id] } },
      orderBy: { month: 'asc' },
    });

    expect(stored.map((row) => row.amount)).toEqual([MONEY_MIN, MONEY_MAX]);
  });

  it('takes a month in the future, which the schema bounds in no way', async () => {
    const created = await assign({
      categoryId: category.id,
      month: toDbMonth('2099-12'),
      amount: 1000n,
    });

    expect(calendarMonthOf(created.month)).toBe('2099-12');
  });

  it('refuses a row naming a budget somebody else owns', async () => {
    const refused = await assign({
      categoryId: category.id,
      budgetId: budgetOfOtherUser.id,
      month: toDbMonth('2026-02'),
      amount: 1000n,
    }).catch((error: unknown) => error);

    // Named, because this row breaks both composite keys at once. Without the name the test
    // stays green on the category key alone, and the budget key is the one holding this row's
    // owner to the owner of the budget it claims.
    expect(codeOf(refused)).toBe('P2003');
    expect(String(refused)).toContain('assignment_budget_id_user_id_fkey');
  });

  it('refuses a row naming a category from another budget', async () => {
    const refused = await assign({
      categoryId: categoryOfOtherBudget.id,
      month: toDbMonth('2026-02'),
      amount: 1000n,
    }).catch((error: unknown) => error);

    expect(codeOf(refused)).toBe('P2003');
  });

  it('refuses to delete a category an assignment still names', async () => {
    await assign({ categoryId: category.id, month: toDbMonth('2026-02'), amount: 1000n });

    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toThrow(
      /assignment_category_id_budget_id_fkey/,
    );
  });

  it('lets a mutation upsert by the pair, which is how a move edits an assignment', async () => {
    await inMutation(() =>
      scoped.assignment.upsert({
        where: { categoryId_month: { categoryId: category.id, month: toDbMonth('2026-02') } },
        create: {
          userId: USER,
          budgetId: budget.id,
          categoryId: category.id,
          month: toDbMonth('2026-02'),
          amount: 1000n,
        },
        update: { amount: 2500n },
      }),
    );
    await inMutation(() =>
      scoped.assignment.upsert({
        where: { categoryId_month: { categoryId: category.id, month: toDbMonth('2026-02') } },
        create: {
          userId: USER,
          budgetId: budget.id,
          categoryId: category.id,
          month: toDbMonth('2026-02'),
          amount: 1000n,
        },
        update: { amount: 2500n },
      }),
    );

    const stored = await prisma.assignment.findMany({ where: { userId: USER } });

    expect(stored).toHaveLength(1);
    expect(stored[0]?.amount).toBe(2500n);
  });

  it('reaches no row outside the active budget, on the pair of a category held elsewhere', async () => {
    const elsewhere = await prisma.assignment.create({
      data: {
        userId: USER,
        budgetId: otherBudget.id,
        categoryId: categoryOfOtherBudget.id,
        month: toDbMonth('2026-02'),
        amount: 1000n,
      },
    });

    const answer = await inMutation(() =>
      scoped.assignment
        .upsert({
          where: {
            categoryId_month: {
              categoryId: categoryOfOtherBudget.id,
              month: toDbMonth('2026-02'),
            },
          },
          create: {
            userId: USER,
            budgetId: otherBudget.id,
            categoryId: categoryOfOtherBudget.id,
            month: toDbMonth('2026-02'),
            amount: 7n,
          },
          update: { amount: 7n },
        })
        .catch((error: unknown) => error),
    );

    const stored = await prisma.assignment.findUniqueOrThrow({ where: { id: elsewhere.id } });

    // The scope never reaches the row, and what comes back depends on the payload rather than on
    // who owns it: naming another budget falls back to a select and a plain insert, which the
    // index refuses. Naming the budget the scope carries answers with nothing instead, which the
    // test below pins. Neither is the row, and neither shows in the type.
    expect(codeOf(answer)).toBe('P2002');
    expect(stored.amount).toBe(1000n);
    expect(await prisma.assignment.count({ where: { userId: USER } })).toBe(1);
  });

  it('answers with nothing when the payload names the budget the scope carries', async () => {
    const elsewhere = await prisma.assignment.create({
      data: {
        userId: USER,
        budgetId: otherBudget.id,
        categoryId: categoryOfOtherBudget.id,
        month: toDbMonth('2026-02'),
        amount: 1000n,
      },
    });

    const answer = await inMutation(() =>
      scoped.assignment
        .upsert({
          where: {
            categoryId_month: {
              categoryId: categoryOfOtherBudget.id,
              month: toDbMonth('2026-02'),
            },
          },
          create: {
            userId: USER,
            budgetId: budget.id,
            categoryId: categoryOfOtherBudget.id,
            month: toDbMonth('2026-02'),
            amount: 7n,
          },
          update: { amount: 7n },
        })
        .catch((error: unknown) => error),
    );

    const stored = await prisma.assignment.findUniqueOrThrow({ where: { id: elsewhere.id } });

    expect(answer).toBeNull();
    expect(stored.amount).toBe(1000n);
    expect(await prisma.assignment.count({ where: { userId: USER } })).toBe(1);
  });

  it('surfaces a duplicate pair as the conflict it is, never as a replay of the key', async () => {
    const write = () =>
      asUser(() =>
        mutations.run(
          { key: 'two-assignments-one-pair', request: { month: '2026-02' }, decode: () => null },
          async (tx) => {
            const row = {
              userId: USER,
              budgetId: budget.id,
              categoryId: category.id,
              month: toDbMonth('2026-02'),
            };
            await tx.assignment.create({ data: { ...row, amount: 1000n } });
            await tx.assignment.create({ data: { ...row, amount: 2000n } });

            return null;
          },
        ),
      );

    const refused = await write().catch((error: unknown) => error);

    expect(codeOf(refused)).toBe('P2002');
    expect(await prisma.assignment.count({ where: { userId: USER } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { userId: USER } })).toBe(0);
  });

  describe('the look a category may carry', () => {
    it('writes a category with neither an icon nor a colour', async () => {
      const plain = await createCategory(USER, budget.id, 'Plain');

      const stored = await prisma.category.findUniqueOrThrow({ where: { id: plain.id } });

      expect(stored.icon).toBeNull();
      expect(stored.color).toBeNull();
    });

    it('refuses an icon name longer than the column holds', async () => {
      const refused = await prisma.category
        .update({ where: { id: category.id }, data: { icon: 'x'.repeat(33) } })
        .catch((error: unknown) => error);

      expect(codeOf(refused)).toBe('P2000');
    });
  });
});
