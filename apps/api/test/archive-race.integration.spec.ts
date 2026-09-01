import { parseCalendarDate, toDbDate, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoClosing';

const ROUNDS = 8;

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

describe('archiving an account while its money is moving (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  beforeAll(async () => {
    harness = await startCategoryHarness(PREFIX);
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();
  });

  const post = (userId: string, path: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(path)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const patch = (userId: string, path: string, body: Record<string, unknown>) =>
    request(harness.server())
      .patch(path)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const archive = (userId: string, accountId: string, round: number) =>
    post(userId, `/accounts/${accountId}/archive`, { idempotencyKey: `close-${round}` });

  const balanceOf = async (accountId: string): Promise<bigint> => {
    const summed = await harness.prisma.transaction.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });

    return summed._sum.amount ?? 0n;
  };

  const archivedAtOf = async (accountId: string): Promise<Date | null> => {
    const row = await harness.prisma.account.findUniqueOrThrow({ where: { id: accountId } });

    return row.archivedAt;
  };

  const emptyAccount = async (userId: string) => {
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id, { createdAt: OPENED });

    await harness.prisma.transaction.create({
      data: {
        userId,
        budgetId: budget.id,
        accountId: account.id,
        date: toDbDate(parseCalendarDate(TODAY)),
        amount: 0n,
        type: 'INCOME',
        isSystem: true,
      },
    });

    return { budget, account };
  };

  it('never archives an account that a new record is landing on', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Writes${round}`;
      const { budget, account } = await emptyAccount(userId);
      const group = await harness.seedGroup(userId, budget.id, 'Дом');
      const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

      const [closing, writing] = await Promise.all([
        archive(userId, account.id, round),
        post(userId, '/transactions', {
          accountId: account.id,
          categoryId: category.id,
          type: 'EXPENSE',
          amount: '12000',
          date: TODAY,
          idempotencyKey: `entry-${round}`,
        }),
      ]);

      const accepted = [closing.status, writing.status].filter((status) => status < 300);

      expect(accepted).toHaveLength(1);
      expect(
        (await archivedAtOf(account.id)) === null || (await balanceOf(account.id)) === 0n,
      ).toBe(true);
    }
  });

  it('never archives an account that a record is being deleted from', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Deletes${round}`;
      const { budget, account } = await emptyAccount(userId);
      const group = await harness.seedGroup(userId, budget.id, 'Дом');
      const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

      const entry = async (type: string, amount: string, key: string): Promise<string> => {
        const written = await post(userId, '/transactions', {
          accountId: account.id,
          categoryId: category.id,
          type,
          amount,
          date: TODAY,
          idempotencyKey: key,
        }).expect(201);

        return String(asRecord(written.body)['id']);
      };

      await entry('INCOME', '9000', `in-${round}`);
      const spent = await entry('EXPENSE', '9000', `out-${round}`);

      const [closing, dropping] = await Promise.all([
        archive(userId, account.id, round),
        post(userId, `/transactions/${spent}/delete`, { idempotencyKey: `drop-${round}` }),
      ]);

      expect(closing.status).not.toBe(500);
      expect(dropping.status).not.toBe(500);

      if ((await archivedAtOf(account.id)) !== null) {
        expect(await balanceOf(account.id)).toBe(0n);
      }
    }
  });

  it('never archives an account whose transfer is being unwound on the other side', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Legs${round}`;
      const budget = await harness.seedBudget(userId);
      const kept = await harness.seedAccount(userId, budget.id, {
        name: 'Основной',
        createdAt: OPENED,
      });
      const closing = await harness.seedAccount(userId, budget.id, {
        name: 'Закрываемый',
        createdAt: OPENED,
      });

      const there = await harness.seedTransfer(
        userId,
        budget.id,
        { fromAccountId: kept.id, toAccountId: closing.id },
        TODAY,
        10_000n,
      );
      await harness.seedTransfer(
        userId,
        budget.id,
        { fromAccountId: closing.id, toAccountId: kept.id },
        TODAY,
        10_000n,
      );

      const [closed, unwound] = await Promise.all([
        archive(userId, closing.id, round),
        post(userId, `/transfers/${there.transferId}/delete`, {
          idempotencyKey: `unwind-${round}`,
        }),
      ]);

      expect(closed.status).not.toBe(500);
      expect(unwound.status).not.toBe(500);

      if ((await archivedAtOf(closing.id)) !== null) {
        expect(await balanceOf(closing.id)).toBe(0n);
      }
    }
  });

  it('never archives an account whose opening balance is being corrected under it', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Opening${round}`;
      const { account } = await emptyAccount(userId);

      const [closed, corrected] = await Promise.all([
        archive(userId, account.id, round),
        patch(userId, `/accounts/${account.id}/opening-balance`, {
          amount: '40000',
          idempotencyKey: `opening-${round}`,
        }),
      ]);

      expect(closed.status).not.toBe(500);
      expect(corrected.status).not.toBe(500);

      const accepted = [closed.status, corrected.status].filter((status) => status < 300);

      expect(accepted).toHaveLength(1);

      if (closed.status < 300) {
        expect(await balanceOf(account.id)).toBe(0n);
      } else {
        expect(await archivedAtOf(account.id)).toBeNull();
        expect(await balanceOf(account.id)).toBe(40_000n);
      }
    }
  });
  it('renames an account twice at once without deadlocking on its own row', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Renames${round}`;
      const { account } = await emptyAccount(userId);

      const rename = (name: string, key: string) =>
        patch(userId, `/accounts/${account.id}`, { name, idempotencyKey: key });

      const [first, second] = await Promise.all([
        rename('Копилка', `rename-first-${round}`),
        rename('Карта', `rename-second-${round}`),
      ]);

      expect(first.status).not.toBe(500);
      expect(second.status).not.toBe(500);
      expect([first.status, second.status]).toEqual([200, 200]);

      const stored = await harness.prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(['Копилка', 'Карта']).toContain(stored.name);
    }
  });
});
