import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { RequestContextService } from '@/request-context/request-context.service';

const USER_A = 'user_2rondoScopingAaaaaaaaaaa';
const USER_B = 'user_2rondoScopingBbbbbbbbbbb';

describe('userId auto-scoping (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scoped: ScopedPrismaClient;
  let context: RequestContextService;

  const asUser = <T>(userId: string, query: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(userId);
      return await query();
    });

  const removeFixtures = (): Promise<unknown> =>
    prisma.userSettings.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    scoped = app.get<ScopedPrismaClient>(SCOPED_PRISMA);
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
});
