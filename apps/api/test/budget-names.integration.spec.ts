import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoNames';

const USER = `${PREFIX}Owner`;
const OTHER_USER = `${PREFIX}Stranger`;

const ZONE = 'Europe/Warsaw';

const ROUNDS = 8;
const RACE_TIMEOUT_MS = 60_000;

const reasonOf = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && 'reason' in body ? body.reason : undefined;

describe('a budget name is the caller’s own, once (integration)', () => {
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

  const create = (userId: string, name: string, over: Record<string, unknown> = {}) =>
    request(harness.server())
      .post('/budgets')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({
        language: 'ru',
        name,
        currency: 'PLN',
        timezone: ZONE,
        withDefaultCategories: false,
        idempotencyKey: `create-${name}`,
        ...over,
      });

  const rename = (userId: string, id: string, name: string) =>
    request(harness.server())
      .patch(`/budgets/${id}`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({ name, idempotencyKey: `rename-${name}` });

  const namesOf = async (userId: string): Promise<string[]> =>
    (await harness.prisma.budget.findMany({ where: { userId }, orderBy: { name: 'asc' } })).map(
      (budget) => budget.name,
    );

  const keysOf = (userId: string): Promise<number> =>
    harness.prisma.idempotencyKey.count({ where: { userId } });

  describe('creating', () => {
    it('refuses a name the caller already has, and writes nothing', async () => {
      await harness.seedBudget(USER, { name: 'Дом' });

      const response = await create(USER, 'Дом');

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('NAME_TAKEN');
      await expect(namesOf(USER)).resolves.toEqual(['Дом']);
      await expect(keysOf(USER)).resolves.toBe(0);
    });

    it('refuses the same name in another case or with spaces around it', async () => {
      await harness.seedBudget(USER, { name: 'Дом' });

      const shouted = await create(USER, 'ДОМ');
      const padded = await create(USER, '  дом  ');

      expect([shouted.status, padded.status]).toEqual([400, 400]);
      expect([reasonOf(shouted.body), reasonOf(padded.body)]).toEqual(['NAME_TAKEN', 'NAME_TAKEN']);
      await expect(namesOf(USER)).resolves.toEqual(['Дом']);
    });

    it('counts the name of a budget that is not the active one', async () => {
      await harness.seedBudget(USER, { name: 'Активный' });
      await harness.seedBudget(USER, { name: 'Отпуск', active: false });

      const response = await create(USER, 'отпуск');

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('NAME_TAKEN');
    });

    it('refuses a taken name for a budget started from another one', async () => {
      const template = await harness.seedBudget(USER, { name: 'Дом' });

      const response = await create(USER, 'Дом', { templateId: template.id });

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('NAME_TAKEN');
      await expect(namesOf(USER)).resolves.toEqual(['Дом']);
    });

    it('lets another user take a name the caller has', async () => {
      await harness.seedBudget(USER, { name: 'Дом' });

      const response = await create(OTHER_USER, 'Дом');

      expect(response.status).toBe(201);
      await expect(namesOf(OTHER_USER)).resolves.toEqual(['Дом']);
    });

    it(
      'answers two creations of one name at once with one budget and one refusal, never a failure',
      async () => {
        for (let round = 0; round < ROUNDS; round += 1) {
          const userId = `${PREFIX}Race${round}`;
          if (round % 2 === 0) {
            await harness.seedBudget(userId, { name: 'Первый' });
          }

          const responses = await Promise.all([
            create(userId, 'Близнец', { idempotencyKey: 'left' }),
            create(userId, 'близнец', { idempotencyKey: 'right' }),
          ]);

          expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
          const refused = responses.find((response) => response.status === 400);
          expect(reasonOf(refused?.body)).toBe('NAME_TAKEN');
          expect(
            (await namesOf(userId)).filter((name) => name.toLowerCase() === 'близнец'),
          ).toHaveLength(1);
        }
      },
      RACE_TIMEOUT_MS,
    );
  });

  describe('renaming', () => {
    it('refuses the name of another budget of the caller, and leaves the budget as it was', async () => {
      await harness.seedBudget(USER, { name: 'Дом' });
      const trip = await harness.seedBudget(USER, { name: 'Отпуск', active: false });

      const response = await rename(USER, trip.id, 'дом');

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('NAME_TAKEN');
      await expect(namesOf(USER)).resolves.toEqual(['Дом', 'Отпуск']);
    });

    it('lets a budget keep its own name in another case', async () => {
      const home = await harness.seedBudget(USER, { name: 'дом' });

      const response = await rename(USER, home.id, 'Дом');

      expect(response.status).toBe(200);
      await expect(namesOf(USER)).resolves.toEqual(['Дом']);
    });
  });

  describe('the database', () => {
    it('refuses a second budget of one caller under one name, whatever its case, even past the service', async () => {
      await harness.seedBudget(USER, { name: 'Дом' });

      await expect(harness.seedBudget(USER, { name: 'ДОМ', active: false })).rejects.toMatchObject({
        code: 'P2002',
      });
      await expect(harness.seedBudget(OTHER_USER, { name: 'Дом' })).resolves.toHaveProperty('id');
    });
  });
});
