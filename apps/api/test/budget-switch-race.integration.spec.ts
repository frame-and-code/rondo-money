import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoRaceSwitch';

const ROUNDS = 8;

describe('switching the active budget while another request changes it (integration)', () => {
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

  const activate = (userId: string, id: string, idempotencyKey: string) =>
    post(userId, `/budgets/${id}/activate`, { idempotencyKey });

  const create = (userId: string, name: string, idempotencyKey: string) =>
    post(userId, '/budgets', {
      language: 'ru',
      name,
      currency: 'PLN',
      timezone: 'Europe/Warsaw',
      withDefaultCategories: false,
      idempotencyKey,
    });

  const budgetsOf = (userId: string) => harness.prisma.budget.findMany({ where: { userId } });

  const activeCountOf = async (userId: string): Promise<number> =>
    (await budgetsOf(userId)).filter((budget) => budget.active).length;

  it('answers two switches to different budgets and leaves exactly one active', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Two${round}`;
      await harness.seedBudget(userId, { name: 'Первый' });
      const second = await harness.seedBudget(userId, { name: 'Второй', active: false });
      const third = await harness.seedBudget(userId, { name: 'Третий', active: false });

      const responses = await Promise.all([
        activate(userId, second.id, 'to-second'),
        activate(userId, third.id, 'to-third'),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      await expect(activeCountOf(userId)).resolves.toBe(1);
    }
  });

  it('answers a creation and a switch arriving together and leaves exactly one active', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Mixed${round}`;
      await harness.seedBudget(userId, { name: 'Первый' });
      const second = await harness.seedBudget(userId, { name: 'Второй', active: false });

      const [created, switched] = await Promise.all([
        create(userId, 'Третий', 'create'),
        activate(userId, second.id, 'to-second'),
      ]);

      expect([created.status, switched.status]).toEqual([201, 200]);
      await expect(budgetsOf(userId)).resolves.toHaveLength(3);
      await expect(activeCountOf(userId)).resolves.toBe(1);
    }
  });

  it('answers two creations by a user who already has a budget and leaves exactly one active', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Creates${round}`;
      await harness.seedBudget(userId, { name: 'Первый' });

      const responses = await Promise.all([
        create(userId, 'Второй', 'create-second'),
        create(userId, 'Третий', 'create-third'),
      ]);

      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      await expect(budgetsOf(userId)).resolves.toHaveLength(3);
      await expect(activeCountOf(userId)).resolves.toBe(1);
    }
  });

  it('lands both a rename and an activation of one budget arriving together', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const userId = `${PREFIX}Renamed${round}`;
      await harness.seedBudget(userId, { name: 'Первый' });
      const second = await harness.seedBudget(userId, { name: 'Второй', active: false });

      const [renamed, switched] = await Promise.all([
        request(harness.server())
          .patch(`/budgets/${second.id}`)
          .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
          .send({ name: 'Отпуск', idempotencyKey: 'rename' }),
        activate(userId, second.id, 'to-second'),
      ]);

      expect([renamed.status, switched.status]).toEqual([200, 200]);
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: second.id } }),
      ).resolves.toMatchObject({ name: 'Отпуск', active: true });
      await expect(activeCountOf(userId)).resolves.toBe(1);
    }
  });
});
