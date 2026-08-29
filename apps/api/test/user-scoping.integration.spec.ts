import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';
import { MUTATOR_PRISMA, type MutatorPrismaClient } from '@/prisma/scoped-prisma';
import { RequestContextService } from '@/request-context/request-context.service';

const USER_A = 'user_2rondoScopingAaaaaaaaaaa';
const USER_B = 'user_2rondoScopingBbbbbbbbbbb';

describe('userId auto-scoping (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scoped: MutatorPrismaClient;
  let context: RequestContextService;

  const asUser = <T>(userId: string, query: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(userId);
      return await query();
    });

  const owners = { userId: { in: [USER_A, USER_B] } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.assignment.deleteMany({ where: owners });
    await prisma.transaction.deleteMany({ where: owners });
    await prisma.category.deleteMany({ where: owners });
    await prisma.categoryGroup.deleteMany({ where: owners });
    await prisma.account.deleteMany({ where: owners });
    await prisma.idempotencyKey.deleteMany({ where: owners });
    await prisma.budget.deleteMany({ where: owners });
    await prisma.userSettings.deleteMany({ where: owners });
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);

    prisma = app.get(PrismaService);
    scoped = app.get<MutatorPrismaClient>(MUTATOR_PRISMA);
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
  });

  it('overwrites the owner named in a create with the caller', async () => {
    const created = await asUser(USER_A, () =>
      scoped.userSettings.create({ data: { userId: USER_B } }),
    );

    const stored = await prisma.userSettings.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.userId).toBe(USER_A);
  });

  it('accepts an empty createMany as the no-op it is', async () => {
    const result = await asUser(USER_A, () => scoped.userSettings.createMany({ data: [] }));

    expect(result).toEqual({ count: 0 });
  });

  it('overwrites the owner on every row of a createMany', async () => {
    await asUser(USER_B, () => scoped.userSettings.createMany({ data: [{ userId: USER_A }] }));

    const owners = await prisma.userSettings
      .findMany({ where: { userId: { in: [USER_A, USER_B] } } })
      .then((rows) => rows.map((row) => row.userId));

    expect(owners).toEqual([USER_B]);
  });

  describe('with a row belonging to user A', () => {
    let rowOfA: { id: string };

    beforeEach(async () => {
      rowOfA = await prisma.userSettings.create({ data: { userId: USER_A } });
    });

    it('returns nothing of A to B, on every kind of read', async () => {
      const seen = await asUser(USER_B, async () => ({
        many: await scoped.userSettings.findMany(),
        count: await scoped.userSettings.count(),
        first: await scoped.userSettings.findFirst(),
        byId: await scoped.userSettings.findUnique({ where: { id: rowOfA.id } }),
      }));

      expect(seen).toEqual({ many: [], count: 0, first: null, byId: null });
    });

    it('lets A read its own row back', async () => {
      const rows = await asUser(USER_A, () => scoped.userSettings.findMany());

      expect(rows.map((row) => row.id)).toEqual([rowOfA.id]);
    });

    it('refuses to let B change or remove the row', async () => {
      await expect(
        asUser(USER_B, () => scoped.userSettings.update({ where: { id: rowOfA.id }, data: {} })),
      ).rejects.toThrow();

      await expect(
        asUser(USER_B, () => scoped.userSettings.delete({ where: { id: rowOfA.id } })),
      ).rejects.toThrow();

      const bulk = await asUser(USER_B, async () => ({
        updated: await scoped.userSettings.updateMany({ data: {} }),
        deleted: await scoped.userSettings.deleteMany({}),
      }));

      expect(bulk).toEqual({ updated: { count: 0 }, deleted: { count: 0 } });
      await expect(
        prisma.userSettings.findUnique({ where: { id: rowOfA.id } }),
      ).resolves.not.toBeNull();
    });

    it('will not let A hand its row to B through the update payload', async () => {
      await asUser(USER_A, () =>
        scoped.userSettings.update({ where: { id: rowOfA.id }, data: { userId: USER_B } }),
      );

      const stored = await prisma.userSettings.findUniqueOrThrow({ where: { id: rowOfA.id } });
      expect(stored.userId).toBe(USER_A);
    });

    it("turns an upsert aimed at A's row into B's own row", async () => {
      await asUser(USER_B, () =>
        scoped.userSettings.upsert({
          where: { userId: USER_A },
          create: { userId: USER_A },
          update: {},
        }),
      );

      const owners = await prisma.userSettings
        .findMany({ where: { userId: { in: [USER_A, USER_B] } }, orderBy: { userId: 'asc' } })
        .then((rows) => rows.map((row) => row.userId));

      expect(owners).toEqual([USER_A, USER_B]);
    });

    it('keeps scoping inside a transaction', async () => {
      const seenInTransaction = await asUser(USER_B, () =>
        scoped.$transaction(async (tx) => {
          await tx.userSettings.create({ data: { userId: USER_A } });
          return tx.userSettings.findMany();
        }),
      );

      expect(seenInTransaction.map((row) => row.userId)).toEqual([USER_B]);
    });
  });
  describe('across the domain core', () => {
    let budgetOfA: { id: string };
    let budgetOfB: { id: string };
    let categoryOfA: { id: string };
    let groupOfA: { id: string };
    let assignmentOfA: { id: string };

    const asOwner = <T>(userId: string, budgetId: string, query: () => Promise<T>): Promise<T> =>
      context.run(async () => {
        context.setUserId(userId);
        context.setBudgetId(budgetId);
        return await query();
      });

    const mutatingAsOwner = <T>(
      userId: string,
      budgetId: string,
      query: () => Promise<T>,
    ): Promise<T> => asOwner(userId, budgetId, () => context.runInMutation(query));

    const createBudget = (userId: string) =>
      prisma.budget.create({
        data: {
          userId,
          name: 'Main',
          currency: 'USD',
          minorDigits: 2,
          timezone: 'Europe/Warsaw',
          active: true,
        },
      });

    beforeEach(async () => {
      budgetOfA = await createBudget(USER_A);
      budgetOfB = await createBudget(USER_B);

      groupOfA = await prisma.categoryGroup.create({
        data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
      });
      categoryOfA = await prisma.category.create({
        data: {
          userId: USER_A,
          budgetId: budgetOfA.id,
          groupId: groupOfA.id,
          name: 'Food',
          sortOrder: 0,
        },
      });
      const accountOfA = await prisma.account.create({
        data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Wallet', type: 'CASH' },
      });
      await prisma.transaction.create({
        data: {
          userId: USER_A,
          budgetId: budgetOfA.id,
          accountId: accountOfA.id,
          categoryId: categoryOfA.id,
          date: new Date('2026-03-05T00:00:00Z'),
          amount: -500n,
          type: 'EXPENSE',
        },
      });
      await prisma.idempotencyKey.create({
        data: { userId: USER_A, key: 'intent-of-a', requestFingerprint: 'f' },
      });
      assignmentOfA = await prisma.assignment.create({
        data: {
          userId: USER_A,
          budgetId: budgetOfA.id,
          categoryId: categoryOfA.id,
          month: new Date('2026-02-01T00:00:00Z'),
          amount: 1000n,
        },
      });
    });

    it('shows B nothing of A, on every model the phase adds', async () => {
      const seen = await asOwner(USER_B, budgetOfB.id, async () => ({
        budgets: await scoped.budget.findMany(),
        groups: await scoped.categoryGroup.findMany(),
        categories: await scoped.category.findMany(),
        accounts: await scoped.account.findMany(),
        transactions: await scoped.transaction.findMany(),
        assignments: await scoped.assignment.findMany(),
        keys: await scoped.idempotencyKey.findMany(),
      }));

      expect(seen).toEqual({
        budgets: [expect.objectContaining({ id: budgetOfB.id })],
        groups: [],
        categories: [],
        accounts: [],
        transactions: [],
        assignments: [],
        keys: [],
      });
    });

    it('counts none of A`s rows for B either', async () => {
      const counted = await asOwner(USER_B, budgetOfB.id, async () => ({
        transactions: await scoped.transaction.count(),
        categories: await scoped.category.count(),
        assignments: await scoped.assignment.count(),
      }));

      expect(counted).toEqual({ transactions: 0, categories: 0, assignments: 0 });
    });

    it('stamps a domain write with the caller, whoever the payload names', async () => {
      const created = await mutatingAsOwner(USER_B, budgetOfB.id, () =>
        scoped.account.create({
          data: { userId: USER_A, budgetId: budgetOfB.id, name: 'Claimed', type: 'DEBIT' },
        }),
      );

      const stored = await prisma.account.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.userId).toBe(USER_B);
    });

    it('shows B nothing of A even when B`s request carries A`s budget', async () => {
      const seen = await asOwner(USER_B, budgetOfA.id, async () => ({
        groups: await scoped.categoryGroup.findMany(),
        categories: await scoped.category.findMany(),
        accounts: await scoped.account.findMany(),
        transactions: await scoped.transaction.findMany(),
      }));

      expect(seen).toEqual({ groups: [], categories: [], accounts: [], transactions: [] });
    });

    it('refuses to let B change or remove a row of A', async () => {
      await expect(
        mutatingAsOwner(USER_B, budgetOfA.id, () =>
          scoped.category.update({ where: { id: categoryOfA.id }, data: { name: 'taken' } }),
        ),
      ).rejects.toThrow();

      await expect(
        mutatingAsOwner(USER_B, budgetOfA.id, () =>
          scoped.category.delete({ where: { id: categoryOfA.id } }),
        ),
      ).rejects.toThrow();

      const bulk = await mutatingAsOwner(USER_B, budgetOfA.id, async () => ({
        updated: await scoped.category.updateMany({ data: { name: 'taken' } }),
        deleted: await scoped.transaction.deleteMany({}),
      }));

      expect(bulk).toEqual({ updated: { count: 0 }, deleted: { count: 0 } });

      const stored = await prisma.category.findUniqueOrThrow({ where: { id: categoryOfA.id } });
      expect(stored.name).toBe('Food');
    });

    it("turns an upsert aimed at A's row into B's own row", async () => {
      const created = await mutatingAsOwner(USER_B, budgetOfB.id, () =>
        scoped.categoryGroup.upsert({
          where: { id: groupOfA.id },
          create: { userId: USER_A, budgetId: budgetOfB.id, name: 'Claimed', sortOrder: 1 },
          update: { name: 'Claimed' },
        }),
      );

      const stored = await prisma.categoryGroup.findUniqueOrThrow({ where: { id: groupOfA.id } });

      expect(created.userId).toBe(USER_B);
      expect(created.id).not.toBe(groupOfA.id);
      expect(stored.name).toBe('Living');
    });

    it('refuses to let B change or remove an assignment of A', async () => {
      await expect(
        mutatingAsOwner(USER_B, budgetOfA.id, () =>
          scoped.assignment.update({ where: { id: assignmentOfA.id }, data: { amount: 7n } }),
        ),
      ).rejects.toThrow();

      await expect(
        mutatingAsOwner(USER_B, budgetOfA.id, () =>
          scoped.assignment.delete({ where: { id: assignmentOfA.id } }),
        ),
      ).rejects.toThrow();

      const bulk = await mutatingAsOwner(USER_B, budgetOfA.id, async () => ({
        updated: await scoped.assignment.updateMany({ data: { amount: 7n } }),
        deleted: await scoped.assignment.deleteMany({}),
      }));

      expect(bulk).toEqual({ updated: { count: 0 }, deleted: { count: 0 } });

      const stored = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentOfA.id } });
      expect(stored.amount).toBe(1000n);
    });

    it("touches nothing when B upserts on the pair A's assignment holds", async () => {
      const answer = await mutatingAsOwner(USER_B, budgetOfB.id, () =>
        scoped.assignment.upsert({
          where: {
            categoryId_month: {
              categoryId: categoryOfA.id,
              month: new Date('2026-02-01T00:00:00Z'),
            },
          },
          create: {
            userId: USER_A,
            budgetId: budgetOfB.id,
            categoryId: categoryOfA.id,
            month: new Date('2026-02-01T00:00:00Z'),
            amount: 7n,
          },
          update: { amount: 7n },
        }),
      );

      const stored = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentOfA.id } });

      expect(answer).toBeNull();
      expect(stored.amount).toBe(1000n);
      expect(await prisma.assignment.count({ where: { userId: USER_B } })).toBe(0);
    });

    it('lets two users hold the same idempotency key without colliding', async () => {
      const forB = await asOwner(USER_B, budgetOfB.id, () =>
        scoped.idempotencyKey.create({
          data: { userId: USER_B, key: 'intent-of-a', requestFingerprint: 'f' },
        }),
      );

      const stored = await prisma.idempotencyKey.findMany({
        where: { key: 'intent-of-a' },
        orderBy: { userId: 'asc' },
      });

      expect(stored.map((row) => row.userId)).toEqual([USER_A, USER_B]);
      expect(forB.key).toBe('intent-of-a');
    });
  });
});
