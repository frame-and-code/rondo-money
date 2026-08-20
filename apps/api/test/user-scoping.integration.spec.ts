import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { RequestContextService } from '@/request-context/request-context.service';

const USER_A = 'user_2rondoScopingAaaaaaaaaaa';
const USER_B = 'user_2rondoScopingBbbbbbbbbbb';

/**
 * Integration level (F0.8): the real extension against the real Postgres. This is the test
 * ADR-005 calls mandatory for every phase that adds domain tables — "user B sees nothing of
 * user A's" — and the only level that can prove it, because what the extension rewrites is
 * only observable in what the database actually returns.
 *
 * Needs the local Postgres (`docker compose up -d` + `pnpm db:migrate`).
 */
describe('userId auto-scoping (integration)', () => {
  let app: INestApplication;
  /** Unscoped on purpose: fixtures and assertions have to see across users. */
  let prisma: PrismaService;
  let scoped: ScopedPrismaClient;
  let context: RequestContextService;

  /**
   * One request from one caller. The `await` belongs inside the scope: Prisma's promises are
   * lazy, so a promise handed out of `run()` executes its hooks with no context at all — in
   * the app the middleware wraps the whole request, awaits included.
   */
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

  // Prisma's types still require `userId` on a write, so a caller always names an owner; what
  // the extension guarantees is that the name it uses is the verified caller's and no one
  // else's. Passing another user's id here is therefore the case worth testing, not `{}`.
  it('overwrites the owner named in a create with the caller', async () => {
    const created = await asUser(USER_A, () =>
      scoped.userSettings.create({ data: { userId: USER_B } }),
    );

    const stored = await prisma.userSettings.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.userId).toBe(USER_A);
  });

  // Regression (F1.3 review): the backstop used to require at least one row, so a batch that a
  // caller had filtered down to nothing was refused as "no scoping rule" — a 500 pointing at a
  // hole that was not there. An empty write is a legal no-op.
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
        // Asking by primary key, which is the read a scoping bug shows up in first: the id
        // is enough to find the row, so only the injected userId keeps it hidden.
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

      // The bulk operations are the quiet ones: they report zero rows instead of failing,
      // which is exactly what an unscoped version would not do.
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
      // F3.2 puts every mutation inside `$transaction` (ADR-006), so the extension has to
      // hold on the transactional client too — proving it here means that phase starts from
      // a known-good base instead of discovering this later.
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
