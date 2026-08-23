import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MONEY_MAX, MONEY_MIN, minorDigits } from '@rondo/types';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';

const USER = 'user_2rondoCoreAaaaaaaaaaaaaaa';
const OTHER_USER = 'user_2rondoCoreCcccccccccccccc';
const OWNERS = { userId: { in: [USER, OTHER_USER] } };

describe('the domain core tables (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: OWNERS });
    await prisma.category.deleteMany({ where: OWNERS });
    await prisma.categoryGroup.deleteMany({ where: OWNERS });
    await prisma.account.deleteMany({ where: OWNERS });
    await prisma.idempotencyKey.deleteMany({ where: OWNERS });
    await prisma.budget.deleteMany({ where: OWNERS });
  };

  const createBudget = (currency = 'USD', digits = 2) =>
    prisma.budget.create({
      data: {
        userId: USER,
        name: 'Main',
        currency,
        minorDigits: digits,
        timezone: 'Europe/Warsaw',
        active: true,
      },
    });

  const seed = async () => {
    const budget = await createBudget();
    const group = await prisma.categoryGroup.create({
      data: { userId: USER, budgetId: budget.id, name: 'Living', sortOrder: 0 },
    });
    const category = await prisma.category.create({
      data: { userId: USER, budgetId: budget.id, groupId: group.id, name: 'Food', sortOrder: 0 },
    });
    const account = await prisma.account.create({
      data: { userId: USER, budgetId: budget.id, name: 'Wallet', type: 'CASH' },
    });

    return { budget, group, category, account };
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await removeFixtures();
      await app.close();
    }
  });

  beforeEach(async () => {
    await removeFixtures();
  });

  it('stores a transaction date as a calendar date, with no shift into a timezone', async () => {
    const { budget, account, category } = await seed();

    const created = await prisma.transaction.create({
      data: {
        userId: USER,
        budgetId: budget.id,
        accountId: account.id,
        categoryId: category.id,
        date: new Date('2026-03-05T00:00:00Z'),
        amount: -1250n,
        type: 'EXPENSE',
      },
    });

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.date.toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });

  it('round-trips both ends of the range past what a JavaScript number can hold', async () => {
    const { budget, account } = await seed();

    const created = await prisma.transaction.create({
      data: {
        userId: USER,
        budgetId: budget.id,
        accountId: account.id,
        date: new Date('2026-03-05T00:00:00Z'),
        amount: MONEY_MAX,
        type: 'INCOME',
        isSystem: true,
      },
    });
    const negative = await prisma.transaction.create({
      data: {
        userId: USER,
        budgetId: budget.id,
        accountId: account.id,
        date: new Date('2026-03-05T00:00:00Z'),
        amount: MONEY_MIN,
        type: 'ADJUSTMENT',
      },
    });

    const stored = await prisma.transaction.findMany({
      where: { id: { in: [created.id, negative.id] } },
      orderBy: { amount: 'asc' },
    });

    expect(stored.map((row) => row.amount)).toEqual([MONEY_MIN, MONEY_MAX]);
    expect(Number(MONEY_MAX)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(Number(MONEY_MIN)).toBeLessThan(Number.MIN_SAFE_INTEGER);
  });

  it('reads the digit count back from the budget row rather than recomputing it', async () => {
    const budget = await createBudget('HUF', 2);

    const stored = await prisma.budget.findUniqueOrThrow({ where: { id: budget.id } });

    expect(stored.minorDigits).toBe(2);
    expect(stored.minorDigits).not.toBe(minorDigits('HUF'));
  });

  it('refuses to delete a category an expense still points at', async () => {
    const { budget, account, category } = await seed();
    await prisma.transaction.create({
      data: {
        userId: USER,
        budgetId: budget.id,
        accountId: account.id,
        categoryId: category.id,
        date: new Date('2026-03-05T00:00:00Z'),
        amount: -500n,
        type: 'EXPENSE',
      },
    });

    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toThrow();
  });

  it('keeps a hidden category and its transactions where they are', async () => {
    const { budget, account, category } = await seed();
    await prisma.transaction.create({
      data: {
        userId: USER,
        budgetId: budget.id,
        accountId: account.id,
        categoryId: category.id,
        date: new Date('2026-03-05T00:00:00Z'),
        amount: -500n,
        type: 'EXPENSE',
      },
    });

    await prisma.category.update({
      where: { id: category.id },
      data: { hiddenAt: new Date('2026-03-06T10:00:00Z') },
    });

    const hidden = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
    const spending = await prisma.transaction.findMany({ where: { categoryId: category.id } });

    expect(hidden.hiddenAt).not.toBeNull();
    expect(spending).toHaveLength(1);
  });

  describe('the userId_active key the partial index publishes', () => {
    const twoInactiveAndOneActive = async (): Promise<void> => {
      await createBudget();
      await prisma.budget.create({
        data: {
          userId: USER,
          name: 'Last year',
          currency: 'USD',
          minorDigits: 2,
          timezone: 'Europe/Warsaw',
          active: false,
        },
      });
      await prisma.budget.create({
        data: {
          userId: USER,
          name: 'The year before',
          currency: 'USD',
          minorDigits: 2,
          timezone: 'Europe/Warsaw',
          active: false,
        },
      });
    };

    it('answers a read of the inactive side with one arbitrary row, saying nothing', async () => {
      await twoInactiveAndOneActive();

      const found = await prisma.budget.findUnique({
        where: { userId_active: { userId: USER, active: false } },
      });

      expect(found).not.toBeNull();
      expect(['Last year', 'The year before']).toContain(found?.name);
    });

    it('writes every matching row on an update and only then throws', async () => {
      await twoInactiveAndOneActive();

      await expect(
        prisma.budget.update({
          where: { userId_active: { userId: USER, active: false } },
          data: { name: 'via the key' },
        }),
      ).rejects.toThrow(/zero or one/);

      const written = await prisma.budget.count({ where: { userId: USER, name: 'via the key' } });
      expect(written).toBe(2);
    });

    it('removes every matching row on a delete and only then throws', async () => {
      await twoInactiveAndOneActive();

      await expect(
        prisma.budget.delete({ where: { userId_active: { userId: USER, active: false } } }),
      ).rejects.toThrow(/zero or one/);

      const left = await prisma.budget.count({ where: { userId: USER, active: false } });
      expect(left).toBe(0);
    });

    it('refuses an upsert, because the conflict target has no index without a predicate', async () => {
      await createBudget();

      await expect(
        prisma.budget.upsert({
          where: { userId_active: { userId: USER, active: true } },
          create: {
            userId: USER,
            name: 'Main',
            currency: 'USD',
            minorDigits: 2,
            timezone: 'Europe/Warsaw',
            active: true,
          },
          update: { name: 'upserted' },
        }),
      ).rejects.toThrow(/42P10|ON CONFLICT/);
    });
  });

  it('makes an idempotency key unique per user rather than globally', async () => {
    const other = 'user_2rondoCoreBbbbbbbbbbbbbbb';

    try {
      await prisma.idempotencyKey.create({
        data: { userId: USER, key: 'same-intent', requestFingerprint: 'f' },
      });
      await prisma.idempotencyKey.create({
        data: { userId: other, key: 'same-intent', requestFingerprint: 'f' },
      });

      await expect(
        prisma.idempotencyKey.create({
          data: { userId: USER, key: 'same-intent', requestFingerprint: 'f' },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [USER, other] } } });
    }
  });
  describe('the composite keys that keep a child inside the parent it names', () => {
    const FOREIGN_KEY = /[Ff]oreign key/;

    const budgetOf = (userId: string, name: string, active: boolean) =>
      prisma.budget.create({
        data: {
          userId,
          name,
          currency: 'USD',
          minorDigits: 2,
          timezone: 'Europe/Warsaw',
          active,
        },
      });

    const groupIn = (userId: string, budgetId: string, name: string) =>
      prisma.categoryGroup.create({ data: { userId, budgetId, name, sortOrder: 0 } });

    const categoryIn = (userId: string, budgetId: string, groupId: string, name: string) =>
      prisma.category.create({ data: { userId, budgetId, groupId, name, sortOrder: 0 } });

    const accountIn = (userId: string, budgetId: string, name: string) =>
      prisma.account.create({ data: { userId, budgetId, name, type: 'CASH' as const } });

    it('refuses a category group naming a budget of another user', async () => {
      const theirs = await budgetOf(OTHER_USER, 'Theirs', true);

      await expect(groupIn(USER, theirs.id, 'Living')).rejects.toThrow(FOREIGN_KEY);
    });

    it('refuses a category naming a budget of another user', async () => {
      const theirs = await budgetOf(OTHER_USER, 'Theirs', true);
      const theirGroup = await groupIn(OTHER_USER, theirs.id, 'Living');

      await expect(categoryIn(USER, theirs.id, theirGroup.id, 'Food')).rejects.toThrow(FOREIGN_KEY);
    });

    it('refuses an account naming a budget of another user', async () => {
      const theirs = await budgetOf(OTHER_USER, 'Theirs', true);

      await expect(accountIn(USER, theirs.id, 'Wallet')).rejects.toThrow(FOREIGN_KEY);
    });

    it('refuses a transaction naming a budget of another user', async () => {
      const theirs = await budgetOf(OTHER_USER, 'Theirs', true);
      const theirAccount = await accountIn(OTHER_USER, theirs.id, 'Wallet');

      await expect(
        prisma.transaction.create({
          data: {
            userId: USER,
            budgetId: theirs.id,
            accountId: theirAccount.id,
            date: new Date('2026-03-05T00:00:00Z'),
            amount: -500n,
            type: 'EXPENSE',
          },
        }),
      ).rejects.toThrow(FOREIGN_KEY);
    });

    it('refuses a category whose group belongs to another budget of the same user', async () => {
      const active = await budgetOf(USER, 'This year', true);
      const other = await budgetOf(USER, 'Last year', false);
      const groupElsewhere = await groupIn(USER, other.id, 'Living');

      await expect(categoryIn(USER, active.id, groupElsewhere.id, 'Food')).rejects.toThrow(
        FOREIGN_KEY,
      );
    });

    it('refuses a transaction whose account belongs to another budget', async () => {
      const active = await budgetOf(USER, 'This year', true);
      const other = await budgetOf(USER, 'Last year', false);
      const accountElsewhere = await accountIn(USER, other.id, 'Wallet');

      await expect(
        prisma.transaction.create({
          data: {
            userId: USER,
            budgetId: active.id,
            accountId: accountElsewhere.id,
            date: new Date('2026-03-05T00:00:00Z'),
            amount: -500n,
            type: 'EXPENSE',
          },
        }),
      ).rejects.toThrow(FOREIGN_KEY);
    });

    it('refuses a transaction whose category belongs to another budget', async () => {
      const active = await budgetOf(USER, 'This year', true);
      const other = await budgetOf(USER, 'Last year', false);
      const account = await accountIn(USER, active.id, 'Wallet');
      const groupElsewhere = await groupIn(USER, other.id, 'Living');
      const categoryElsewhere = await categoryIn(USER, other.id, groupElsewhere.id, 'Food');

      await expect(
        prisma.transaction.create({
          data: {
            userId: USER,
            budgetId: active.id,
            accountId: account.id,
            categoryId: categoryElsewhere.id,
            date: new Date('2026-03-05T00:00:00Z'),
            amount: -500n,
            type: 'EXPENSE',
          },
        }),
      ).rejects.toThrow(FOREIGN_KEY);
    });

    it('refuses moving a child into another budget while its parent stays behind', async () => {
      const active = await budgetOf(USER, 'This year', true);
      const other = await budgetOf(USER, 'Last year', false);
      const group = await groupIn(USER, active.id, 'Living');
      const category = await categoryIn(USER, active.id, group.id, 'Food');

      await expect(
        prisma.category.update({ where: { id: category.id }, data: { budgetId: other.id } }),
      ).rejects.toThrow(FOREIGN_KEY);
    });

    it('writes a set whose parents all agree, categoryless transaction included', async () => {
      const budget = await budgetOf(USER, 'This year', true);
      const group = await groupIn(USER, budget.id, 'Living');
      const category = await categoryIn(USER, budget.id, group.id, 'Food');
      const account = await accountIn(USER, budget.id, 'Wallet');

      const expense = await prisma.transaction.create({
        data: {
          userId: USER,
          budgetId: budget.id,
          accountId: account.id,
          categoryId: category.id,
          date: new Date('2026-03-05T00:00:00Z'),
          amount: -500n,
          type: 'EXPENSE',
        },
      });

      const income = await prisma.transaction.create({
        data: {
          userId: USER,
          budgetId: budget.id,
          accountId: account.id,
          date: new Date('2026-03-06T00:00:00Z'),
          amount: 900n,
          type: 'INCOME',
        },
      });

      expect(expense.categoryId).toBe(category.id);
      expect(income.categoryId).toBeNull();
    });
  });
});
