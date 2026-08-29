import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoRacing';

const ROUNDS = 12;

describe('hiding a category while money is moving into it (integration)', () => {
  let harness: CategoryHarness;

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

  it('never leaves a hidden category holding money, whichever request wins', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Round${round}`;
      const budget = await harness.seedBudget(userId);
      const account = await harness.seedAccount(userId, budget.id);
      const group = await harness.seedGroup(userId, budget.id, 'Дом');
      const category = await harness.seedCategory(userId, budget.id, group.id, 'Отпуск');

      await harness.seedIncome(userId, budget.id, account.id, '2026-02-01', 100_000n);

      const [hide, move] = await Promise.all([
        post(userId, `/categories/${category.id}/hide`, { idempotencyKey: `hide-${round}` }),
        post(userId, '/moves', {
          month: '2026-02',
          amount: '5000',
          from: { kind: 'READY_TO_ASSIGN' },
          to: { kind: 'CATEGORY', categoryId: category.id },
          idempotencyKey: `move-${round}`,
        }),
      ]);

      const row = await harness.prisma.category.findUniqueOrThrow({ where: { id: category.id } });
      const held = await harness.prisma.assignment.aggregate({
        where: { categoryId: category.id },
        _sum: { amount: true },
      });

      const accepted = [hide.status, move.status].filter((status) => status === 201);

      expect(accepted).toHaveLength(1);
      expect(row.hiddenAt === null || (held._sum.amount ?? 0n) === 0n).toBe(true);
    }
  });
});
