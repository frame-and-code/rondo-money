import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@rondo/db';
import { parseMoney, serializeMoney } from '@rondo/types';

import { AppModule } from '@/app.module';
import { MutationService, type MutationClient } from '@/mutations/mutation.service';
import { PrismaService } from '@/prisma/prisma.service';
import { SCOPED_PRISMA, type ScopedPrismaClient } from '@/prisma/scoped-prisma';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';
import { RequestContextService } from '@/request-context/request-context.service';

const USER_A = 'user_2rondoMutationAaaaaaaaaaa';
const USER_B = 'user_2rondoMutationBbbbbbbbbbb';
const OWNERS = { userId: { in: [USER_A, USER_B] } };

const asRecord = (stored: Prisma.JsonValue): Record<string, unknown> => {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    throw new Error(`A stored mutation result is not an object: ${JSON.stringify(stored)}`);
  }

  return stored;
};

const decodeName = (stored: Prisma.JsonValue): { name: string } => {
  const { name } = asRecord(stored);
  if (typeof name !== 'string') {
    throw new Error(`A stored mutation result carries no name: ${JSON.stringify(stored)}`);
  }

  return { name };
};

const decodeAmount = (stored: Prisma.JsonValue): { amount: bigint } => {
  const { amount } = asRecord(stored);
  if (typeof amount !== 'string') {
    throw new Error(`A stored mutation result carries no amount: ${JSON.stringify(stored)}`);
  }

  return { amount: parseMoney(amount) };
};

describe('the single write point (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scoped: ScopedPrismaClient;
  let mutations: MutationService;
  let raw: ScopedRawRepository;
  let context: RequestContextService;

  const asUser = <T>(userId: string, work: () => Promise<T>): Promise<T> =>
    context.run(async () => {
      context.setUserId(userId);
      return await work();
    });

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: OWNERS });
    await prisma.category.deleteMany({ where: OWNERS });
    await prisma.categoryGroup.deleteMany({ where: OWNERS });
    await prisma.account.deleteMany({ where: OWNERS });
    await prisma.idempotencyKey.deleteMany({ where: OWNERS });
    await prisma.budget.deleteMany({ where: OWNERS });
  };

  const budgetFor = (userId: string, active: boolean) =>
    prisma.budget.create({
      data: {
        userId,
        name: 'Held',
        currency: 'USD',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active,
      },
    });

  let budgetOfA: { id: string };
  let budgetOfB: { id: string };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    scoped = app.get<ScopedPrismaClient>(SCOPED_PRISMA);
    mutations = app.get(MutationService);
    raw = app.get(ScopedRawRepository);
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
    // A holds no active budget, so the onboarding mutation below can create one; B holds one,
    // so a write of B's reaches the isolation filter rather than stopping short of it.
    budgetOfA = await budgetFor(USER_A, false);
    budgetOfB = await budgetFor(USER_B, true);
  });

  const rowsOf = async (userId: string) => ({
    budgets: await prisma.budget.count({ where: { userId } }),
    groups: await prisma.categoryGroup.count({ where: { userId } }),
    categories: await prisma.category.count({ where: { userId } }),
    accounts: await prisma.account.count({ where: { userId } }),
    transactions: await prisma.transaction.count({ where: { userId } }),
    keys: await prisma.idempotencyKey.count({ where: { userId } }),
  });

  const addGroup =
    (userId: string, budgetId: string, name: string) =>
    async (tx: MutationClient): Promise<{ name: string }> => {
      await tx.categoryGroup.create({ data: { userId, budgetId, name, sortOrder: 0 } });
      return { name };
    };

  describe('one user operation, one transaction', () => {
    it('writes every row of a composite operation, with no active budget to lean on', async () => {
      const result = await asUser(USER_A, () =>
        mutations.run(
          { key: 'onboarding', request: { name: 'Main' }, decode: decodeName },
          async (tx) => {
            const budget = await tx.budget.create({
              data: {
                userId: USER_A,
                name: 'Main',
                currency: 'USD',
                minorDigits: 2,
                timezone: 'Europe/Warsaw',
                active: true,
              },
            });
            const group = await tx.categoryGroup.create({
              data: { userId: USER_A, budgetId: budget.id, name: 'Living', sortOrder: 0 },
            });
            await tx.category.create({
              data: {
                userId: USER_A,
                budgetId: budget.id,
                groupId: group.id,
                name: 'Food',
                sortOrder: 0,
              },
            });
            const account = await tx.account.create({
              data: { userId: USER_A, budgetId: budget.id, name: 'Wallet', type: 'CASH' },
            });
            await tx.transaction.create({
              data: {
                userId: USER_A,
                budgetId: budget.id,
                accountId: account.id,
                date: new Date('2026-03-05T00:00:00Z'),
                amount: 100000n,
                type: 'INCOME',
              },
            });

            return { name: budget.name };
          },
        ),
      );

      expect(result).toEqual({ name: 'Main' });
      expect(await rowsOf(USER_A)).toEqual({
        budgets: 2,
        groups: 1,
        categories: 1,
        accounts: 1,
        transactions: 1,
        keys: 1,
      });
    });

    it('leaves nothing behind when the work fails after rows and the key are written', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'half-way', request: {}, decode: decodeName },
            async (tx): Promise<{ name: string }> => {
              await tx.categoryGroup.create({
                data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
              });
              throw new Error('the second half of the operation failed');
            },
          ),
        ),
      ).rejects.toThrow('the second half of the operation failed');

      expect(await rowsOf(USER_A)).toMatchObject({ groups: 0, keys: 0 });
    });

    it('rolls back on a failure raised by the database rather than by the work', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run({ key: 'bad-parent', request: {}, decode: decodeName }, async (tx) => {
            const group = await tx.categoryGroup.create({
              data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
            });
            await tx.category.create({
              data: {
                userId: USER_A,
                budgetId: budgetOfB.id,
                groupId: group.id,
                name: 'Food',
                sortOrder: 0,
              },
            });

            return { name: 'Food' };
          }),
        ),
      ).rejects.toThrow(/[Ff]oreign key/);

      expect(await rowsOf(USER_A)).toMatchObject({ groups: 0, categories: 0, keys: 0 });
    });

    it('sees the budget it created itself, rather than looking past its own transaction', async () => {
      const seen = await asUser(USER_A, () =>
        mutations.run(
          { key: 'onboarding-then-read', request: {}, decode: decodeName },
          async (tx) => {
            const budget = await tx.budget.create({
              data: {
                userId: USER_A,
                name: 'Main',
                currency: 'USD',
                minorDigits: 2,
                timezone: 'Europe/Warsaw',
                active: true,
              },
            });
            await tx.categoryGroup.create({
              data: { userId: USER_A, budgetId: budget.id, name: 'Living', sortOrder: 0 },
            });

            const groups = await tx.categoryGroup.findMany();

            return { name: groups.map((group) => group.name).join(',') };
          },
        ),
      );

      expect(seen).toEqual({ name: 'Living' });
    });

    it('rethrows a unique violation raised by the work, and claims no key for it', async () => {
      await expect(
        asUser(USER_B, () =>
          mutations.run({ key: 'second-active', request: {}, decode: decodeName }, async (tx) => {
            await tx.budget.create({
              data: {
                userId: USER_B,
                name: 'Another',
                currency: 'USD',
                minorDigits: 2,
                timezone: 'Europe/Warsaw',
                active: true,
              },
            });

            return { name: 'Another' };
          }),
        ),
      ).rejects.toThrow(/[Uu]nique constraint/);

      expect(await rowsOf(USER_B)).toMatchObject({ budgets: 1, keys: 0 });
    });

    it('refuses a write from a promise that outlived the mutation that started it', async () => {
      let escaped: Promise<unknown> = Promise.resolve();

      await asUser(USER_A, () =>
        mutations.run(
          { key: 'escaping', request: {}, decode: decodeName },
          async (tx): Promise<{ name: string }> => {
            await tx.categoryGroup.create({
              data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
            });
            escaped = new Promise((settle) => setTimeout(settle, 5)).then(() =>
              scoped.categoryGroup.create({
                data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Late', sortOrder: 1 },
              }),
            );
            escaped.catch(() => undefined);

            return { name: 'Living' };
          },
        ),
      );

      await expect(escaped).rejects.toThrow(/single mutation service/);

      const names = await prisma.categoryGroup
        .findMany({ where: { userId: USER_A } })
        .then((rows) => rows.map((row) => row.name));

      expect(names).toEqual(['Living']);
    });

    it('refuses a mutation opened inside another one, and rolls the outer one back', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run({ key: 'outer', request: {}, decode: decodeName }, async (tx) => {
            await tx.categoryGroup.create({
              data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
            });

            return await mutations.run(
              { key: 'inner', request: {}, decode: decodeName },
              addGroup(USER_A, budgetOfA.id, 'Bills'),
            );
          }),
        ),
      ).rejects.toThrow(/already has a mutation open/i);

      expect(await rowsOf(USER_A)).toMatchObject({ groups: 0, keys: 0 });
    });

    it('refuses a second mutation started beside the first, not only inside it', async () => {
      const settled = await asUser(USER_A, () =>
        Promise.allSettled([
          mutations.run(
            { key: 'sibling-one', request: {}, decode: decodeName },
            addGroup(USER_A, budgetOfA.id, 'One'),
          ),
          mutations.run(
            { key: 'sibling-two', request: {}, decode: decodeName },
            addGroup(USER_A, budgetOfA.id, 'Two'),
          ),
        ]),
      );

      const refusals = settled
        .filter((outcome) => outcome.status === 'rejected')
        .map((outcome) => String(outcome.reason));

      expect(refusals).toHaveLength(1);
      expect(refusals[0]).toMatch(/already has a mutation open/);
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1 });
    });

    it('forgets a budget it resolved inside a mutation that then rolled back', async () => {
      await asUser(USER_A, async () => {
        await expect(
          mutations.run(
            { key: 'resolve-then-fail', request: {}, decode: decodeName },
            async (tx): Promise<{ name: string }> => {
              const budget = await tx.budget.create({
                data: {
                  userId: USER_A,
                  name: 'Main',
                  currency: 'USD',
                  minorDigits: 2,
                  timezone: 'Europe/Warsaw',
                  active: true,
                },
              });
              await tx.categoryGroup.create({
                data: { userId: USER_A, budgetId: budget.id, name: 'Living', sortOrder: 0 },
              });
              await tx.categoryGroup.findMany();

              throw new Error('rolled back');
            },
          ),
        ).rejects.toThrow('rolled back');

        await expect(scoped.categoryGroup.findMany()).rejects.toThrow(/no active budget/);
      });
    });

    it('refuses a raw read on the pooled client inside a mutation', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'raw-read', request: {}, decode: decodeName },
            async (): Promise<{ name: string }> => {
              await raw.query((scope) => Prisma.sql`select ${scope.userId}::text as owner`);

              return { name: 'read' };
            },
          ),
        ),
      ).rejects.toThrow(/not the mutation's/);
    });

    it('refuses a domain write in a transaction opened outside the service', async () => {
      await expect(
        asUser(USER_A, () =>
          scoped.$transaction((tx) =>
            tx.categoryGroup.create({
              data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
            }),
          ),
        ),
      ).rejects.toThrow(/mutation/);

      expect(await rowsOf(USER_A)).toMatchObject({ groups: 0 });
    });

    it('refuses a write issued on the request client instead of the transaction it is in', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'beside-the-transaction', request: {}, decode: decodeName },
            async (): Promise<{ name: string }> => {
              await scoped.categoryGroup.create({
                data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Beside', sortOrder: 0 },
              });

              return { name: 'Beside' };
            },
          ),
        ),
      ).rejects.toThrow(/outside the transaction/);

      const left = await prisma.categoryGroup.findMany({ where: { userId: USER_A } });
      expect(left).toEqual([]);
    });

    it('refuses a read issued on the request client inside a mutation', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'reading-beside', request: {}, decode: decodeName },
            async (tx): Promise<{ name: string }> => {
              await tx.categoryGroup.create({
                data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
              });
              await scoped.categoryGroup.findMany();

              return { name: 'Living' };
            },
          ),
        ),
      ).rejects.toThrow(/outside the transaction/);

      expect(await rowsOf(USER_A)).toMatchObject({ groups: 0 });
    });

    it('refuses raw SQL handed a client that is not the mutation`s', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'raw-wrong-client', request: {}, decode: decodeName },
            async (): Promise<{ name: string }> => {
              await raw.execute(
                (scope) =>
                  Prisma.sql`update category_group set name = 'renamed' where user_id = ${scope.userId}`,
                scoped,
              );

              return { name: 'renamed' };
            },
          ),
        ),
      ).rejects.toThrow(/not the mutation's/);
    });

    it('confines an upsert to the active budget, as it does an update', async () => {
      const archived = await budgetFor(USER_A, false);
      const active = await prisma.budget.create({
        data: {
          userId: USER_A,
          name: 'This year',
          currency: 'USD',
          minorDigits: 2,
          timezone: 'Europe/Warsaw',
          active: true,
        },
      });
      const elsewhere = await prisma.categoryGroup.create({
        data: { userId: USER_A, budgetId: archived.id, name: 'Old', sortOrder: 0 },
      });

      await asUser(USER_A, () =>
        mutations.run({ key: 'upserting', request: {}, decode: decodeName }, async (tx) => {
          await tx.categoryGroup.upsert({
            where: { id: elsewhere.id },
            create: { userId: USER_A, budgetId: active.id, name: 'Living', sortOrder: 0 },
            update: { name: 'renamed from another budget' },
          });

          return { name: 'Living' };
        }),
      );

      const untouched = await prisma.categoryGroup.findUniqueOrThrow({
        where: { id: elsewhere.id },
      });
      expect(untouched.name).toBe('Old');
    });

    it('runs raw SQL of the mutation inside its transaction, and refuses it outside one', async () => {
      const group = await prisma.categoryGroup.create({
        data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
      });

      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'raw-inside', request: {}, decode: decodeName },
            async (tx): Promise<{ name: string }> => {
              await raw.execute(
                (scope) =>
                  Prisma.sql`update category_group set name = 'renamed by raw sql' where user_id = ${scope.userId}`,
                tx,
              );
              throw new Error('rolled back');
            },
          ),
        ),
      ).rejects.toThrow('rolled back');

      const untouched = await prisma.categoryGroup.findUniqueOrThrow({ where: { id: group.id } });
      expect(untouched.name).toBe('Living');

      await expect(
        asUser(USER_A, () =>
          raw.execute(
            (scope) =>
              Prisma.sql`update category_group set name = 'renamed outside' where user_id = ${scope.userId}`,
            scoped,
          ),
        ),
      ).rejects.toThrow(/mutation/);

      const still = await prisma.categoryGroup.findUniqueOrThrow({ where: { id: group.id } });
      expect(still.name).toBe('Living');
    });
  });

  describe('the idempotency key', () => {
    const groupNamed =
      (name: string) =>
      (userId: string, budgetId: string) =>
      async (tx: MutationClient): Promise<{ name: string }> => {
        await tx.categoryGroup.create({ data: { userId, budgetId, name, sortOrder: 0 } });
        return { name };
      };

    it('does not apply the mutation a second time, and answers with the first result', async () => {
      const first = await asUser(USER_A, () =>
        mutations.run(
          { key: 'one-intent', request: { name: 'Living' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      const second = await asUser(USER_A, () =>
        mutations.run(
          { key: 'one-intent', request: { name: 'Living' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      expect(second).toEqual(first);
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
    });

    it('applies once when two requests carrying one key run side by side', async () => {
      const [first, second] = await Promise.all([
        asUser(USER_A, () =>
          mutations.run(
            { key: 'double-click', request: { name: 'Living' }, decode: decodeName },
            groupNamed('Living')(USER_A, budgetOfA.id),
          ),
        ),
        asUser(USER_A, () =>
          mutations.run(
            { key: 'double-click', request: { name: 'Living' }, decode: decodeName },
            groupNamed('Living')(USER_A, budgetOfA.id),
          ),
        ),
      ]);

      expect(second).toEqual(first);
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
    });

    it('refuses a second intent sent under the first one`s key', async () => {
      await asUser(USER_A, () =>
        mutations.run(
          { key: 'corrected', request: { name: 'Living' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'corrected', request: { name: 'Bills' }, decode: decodeName },
            groupNamed('Bills')(USER_A, budgetOfA.id),
          ),
        ),
      )
        .rejects.toThrow(/idempotency key/i)
        .catch((failure: unknown) => {
          throw failure;
        });

      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'corrected', request: { name: 'Bills' }, decode: decodeName },
            groupNamed('Bills')(USER_A, budgetOfA.id),
          ),
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      const names = await prisma.categoryGroup
        .findMany({ where: { userId: USER_A } })
        .then((rows) => rows.map((row) => row.name));

      expect(names).toEqual(['Living']);
    });

    it('replays an intent whose fields arrive in a different order', async () => {
      const first = await asUser(USER_A, () =>
        mutations.run(
          { key: 'reordered', request: { amount: '500', payee: 'Rent' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      const second = await asUser(USER_A, () =>
        mutations.run(
          { key: 'reordered', request: { payee: 'Rent', amount: '500' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      expect(second).toEqual(first);
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
    });

    it('tells two dates apart, rather than reading every date as the same empty object', async () => {
      await asUser(USER_A, () =>
        mutations.run(
          {
            key: 'dated',
            request: { date: new Date('2026-03-05T00:00:00Z') },
            decode: decodeName,
          },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      await expect(
        asUser(USER_A, () =>
          mutations.run(
            {
              key: 'dated',
              request: { date: new Date('2027-09-09T00:00:00Z') },
              decode: decodeName,
            },
            groupNamed('Bills')(USER_A, budgetOfA.id),
          ),
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
    });

    it('carries money through the stored result as minor units, not as a number', async () => {
      const intent = { key: 'an-amount', request: { amount: '-500' }, decode: decodeAmount };
      const work = async (tx: MutationClient): Promise<{ amount: string }> => {
        const account = await tx.account.create({
          data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Wallet', type: 'CASH' },
        });
        await tx.transaction.create({
          data: {
            userId: USER_A,
            budgetId: budgetOfA.id,
            accountId: account.id,
            date: new Date('2026-03-05T00:00:00Z'),
            amount: -500n,
            type: 'EXPENSE',
          },
        });

        return { amount: serializeMoney(-500n) };
      };

      const fresh = await asUser(USER_A, () => mutations.run(intent, work));
      const replayed = await asUser(USER_A, () => mutations.run(intent, work));

      expect(fresh).toEqual({ amount: -500n });
      expect(replayed).toEqual({ amount: -500n });
      expect(typeof replayed.amount).toBe('bigint');
      expect(await rowsOf(USER_A)).toMatchObject({ transactions: 1, keys: 1 });
    });

    it('replays a mutation that returned nothing instead of running it again', async () => {
      let applied = 0;
      const intent = {
        key: 'returns-nothing',
        request: { hide: true },
        decode: (stored: Prisma.JsonValue): null => {
          if (stored !== null) {
            throw new Error(`Expected a void result, got ${JSON.stringify(stored)}`);
          }

          return null;
        },
      };
      const work = async (tx: MutationClient): Promise<null> => {
        applied += 1;
        await tx.categoryGroup.create({
          data: { userId: USER_A, budgetId: budgetOfA.id, name: `Living ${applied}`, sortOrder: 0 },
        });

        return null;
      };

      const fresh = await asUser(USER_A, () => mutations.run(intent, work));
      const replayed = await asUser(USER_A, () => mutations.run(intent, work));

      expect(fresh).toBeNull();
      expect(replayed).toBeNull();
      expect(applied).toBe(1);
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
    });

    it('keeps the keys of two users apart', async () => {
      const forA = await asUser(USER_A, () =>
        mutations.run(
          { key: 'same-intent', request: { name: 'Living' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );
      const forB = await asUser(USER_B, () =>
        mutations.run(
          { key: 'same-intent', request: { name: 'Bills' }, decode: decodeName },
          groupNamed('Bills')(USER_B, budgetOfB.id),
        ),
      );

      expect(forA).toEqual({ name: 'Living' });
      expect(forB).toEqual({ name: 'Bills' });
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
      expect(await rowsOf(USER_B)).toMatchObject({ groups: 1, keys: 1 });
    });

    it('leaves the key free after a failure, so an honest retry goes through', async () => {
      await expect(
        asUser(USER_A, () =>
          mutations.run(
            { key: 'retried', request: { name: 'Living' }, decode: decodeName },
            (): Promise<{ name: string }> => Promise.reject(new Error('the network went away')),
          ),
        ),
      ).rejects.toThrow('the network went away');

      const retried = await asUser(USER_A, () =>
        mutations.run(
          { key: 'retried', request: { name: 'Living' }, decode: decodeName },
          groupNamed('Living')(USER_A, budgetOfA.id),
        ),
      );

      expect(retried).toEqual({ name: 'Living' });
      expect(await rowsOf(USER_A)).toMatchObject({ groups: 1, keys: 1 });
    });
  });

  describe('what a mutation cannot reach', () => {
    it('writes as the caller, whoever the payload names', async () => {
      await asUser(USER_B, () =>
        mutations.run(
          { key: 'claimed', request: {}, decode: decodeName },
          addGroup(USER_A, budgetOfB.id, 'Claimed'),
        ),
      );

      const stored = await prisma.categoryGroup.findFirstOrThrow({ where: { name: 'Claimed' } });
      expect(stored.userId).toBe(USER_B);
    });

    it('cannot change a row of another user by its id', async () => {
      const groupOfA = await prisma.categoryGroup.create({
        data: { userId: USER_A, budgetId: budgetOfA.id, name: 'Living', sortOrder: 0 },
      });

      await expect(
        asUser(USER_B, () =>
          mutations.run({ key: 'reaching-over', request: {}, decode: decodeName }, async (tx) => {
            await tx.categoryGroup.update({ where: { id: groupOfA.id }, data: { name: 'taken' } });
            return { name: 'taken' };
          }),
        ),
      ).rejects.toThrow(/required but not found|[Nn]o record/);

      const untouched = await prisma.categoryGroup.findUniqueOrThrow({
        where: { id: groupOfA.id },
      });
      expect(untouched.name).toBe('Living');
    });
  });
});
