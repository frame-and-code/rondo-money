import { monthOf, todayIn } from '@rondo/types';
import request from 'supertest';

import { generateOpenApiDocument } from '@/openapi/generate';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const PREFIX = 'user_2rondoSwitch';

const USER = `${PREFIX}Owner`;
const USER_A = `${PREFIX}TenantA`;
const USER_B = `${PREFIX}TenantB`;

const ZONE = 'Europe/Warsaw';

const UNKNOWN_ID = '0199c1a8-9ecf-71c7-a617-c575df0739ff';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

describe('renaming a budget and switching the active one (integration)', () => {
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

  const rename = (userId: string, id: string, body: Record<string, unknown>) =>
    request(harness.server())
      .patch(`/budgets/${id}`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const activate = (userId: string, id: string, idempotencyKey: string) =>
    request(harness.server())
      .post(`/budgets/${id}/activate`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({ idempotencyKey });

  const accountsOf = async (userId: string): Promise<string[]> => {
    const response = await request(harness.server())
      .get('/accounts')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .expect(200);

    const { accounts } = response.body as { accounts: { name: string }[] };

    return accounts.map((account) => account.name);
  };

  const categoriesOf = async (userId: string): Promise<string[]> => {
    const view = await harness.viewOf(userId, monthOf(todayIn(ZONE)));

    return view.groups.flatMap((group) => group.categories.map((category) => category.name));
  };

  const budgetsOf = (userId: string) =>
    harness.prisma.budget.findMany({ where: { userId }, orderBy: { name: 'asc' } });

  const activeNamesOf = async (userId: string): Promise<string[]> =>
    (await budgetsOf(userId)).filter((budget) => budget.active).map((budget) => budget.name);

  const keysOf = (userId: string): Promise<number> =>
    harness.prisma.idempotencyKey.count({ where: { userId } });

  const pair = async (userId: string) => {
    const first = await harness.seedBudget(userId, { name: 'Первый' });
    const second = await harness.seedBudget(userId, { name: 'Второй', active: false });

    return { first, second };
  };

  describe('PATCH /budgets/{id}', () => {
    it('renames the budget and answers with it in exactly the shape the contract publishes', async () => {
      const budget = await harness.seedBudget(USER, { name: 'Основной', currency: 'JPY' });

      const response = await rename(USER, budget.id, { name: 'Семейный', idempotencyKey: 'k1' });
      const document = await generateOpenApiDocument();
      const published = document.components?.schemas?.['BudgetResponse'];
      const fields =
        published && 'properties' in published ? Object.keys(published.properties ?? {}) : [];

      expect(response.status).toBe(200);

      const answered = asRecord(response.body);
      expect(Object.keys(answered).sort()).toEqual(fields.sort());
      expect(answered).toMatchObject({
        id: budget.id,
        name: 'Семейный',
        currency: 'JPY',
        active: true,
      });
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      ).resolves.toMatchObject({ name: 'Семейный', currency: 'JPY' });
    });

    it('renames a budget that is not the active one, and the active one stays as it was', async () => {
      const { first, second } = await pair(USER);

      const response = await rename(USER, second.id, { name: 'Отпуск', idempotencyKey: 'k1' });

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({
        id: second.id,
        name: 'Отпуск',
        active: false,
      });
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: first.id } }),
      ).resolves.toMatchObject({ name: 'Первый', active: true });
    });

    it('stores the name without the spaces around it, and takes the longest one allowed', async () => {
      const budget = await harness.seedBudget(USER);

      const trimmed = await rename(USER, budget.id, { name: '  Дом  ', idempotencyKey: 'k1' });
      const longest = await rename(USER, budget.id, { name: 'x'.repeat(60), idempotencyKey: 'k2' });

      expect(trimmed.status).toBe(200);
      expect(asRecord(trimmed.body)['name']).toBe('Дом');
      expect(longest.status).toBe(200);
      expect(asRecord(longest.body)['name']).toBe('x'.repeat(60));
    });

    it.each([
      ['a name of spaces only', { name: '   ' }],
      ['a name one past the limit', { name: 'x'.repeat(61) }],
      ['a missing name', { name: undefined }],
      ['a currency, which no operation changes', { currency: 'USD' }],
      ['an idempotency key of spaces only', { idempotencyKey: '   ' }],
    ])('refuses %s with 400 and leaves the name alone', async (_case, over) => {
      const budget = await harness.seedBudget(USER, { name: 'Основной' });

      const response = await rename(USER, budget.id, {
        name: 'Другой',
        idempotencyKey: 'k1',
        ...over,
      });

      expect(response.status).toBe(400);
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      ).resolves.toMatchObject({ name: 'Основной', currency: 'PLN' });
      await expect(keysOf(USER)).resolves.toBe(0);
    });

    it('answers a repeated key with what that key wrote, not with what the row says now', async () => {
      const budget = await harness.seedBudget(USER);

      const first = await rename(USER, budget.id, { name: 'A', idempotencyKey: 'k1' });
      await rename(USER, budget.id, { name: 'B', idempotencyKey: 'k2' });
      const repeat = await rename(USER, budget.id, { name: 'A', idempotencyKey: 'k1' });

      expect(repeat.status).toBe(200);
      expect(repeat.body).toEqual(first.body);
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      ).resolves.toMatchObject({ name: 'B' });
    });

    it('refuses a key that was claimed for another name, or for another budget', async () => {
      const { first, second } = await pair(USER);
      await rename(USER, first.id, { name: 'A', idempotencyKey: 'k1' });

      const otherName = await rename(USER, first.id, { name: 'B', idempotencyKey: 'k1' });
      const otherBudget = await rename(USER, second.id, { name: 'A', idempotencyKey: 'k1' });

      expect(otherName.status).toBe(409);
      expect(otherBudget.status).toBe(409);
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: second.id } }),
      ).resolves.toMatchObject({ name: 'Второй' });
    });

    it('names the reason when the caller holds no such budget', async () => {
      await harness.seedBudget(USER);

      const response = await rename(USER, UNKNOWN_ID, { name: 'Дом', idempotencyKey: 'k1' });

      expect(response.status).toBe(404);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_BUDGET');
      await expect(keysOf(USER)).resolves.toBe(0);
    });

    it('answers 400 to an id that is not one', async () => {
      const response = await rename(USER, 'not-a-uuid', { name: 'Дом', idempotencyKey: 'k1' });

      expect(response.status).toBe(400);
    });

    it('answers 401 to an anonymous caller and renames nothing', async () => {
      const budget = await harness.seedBudget(USER, { name: 'Основной' });

      const response = await request(harness.server())
        .patch(`/budgets/${budget.id}`)
        .send({ name: 'Чужой', idempotencyKey: 'k1' });

      expect(response.status).toBe(401);
      await expect(
        harness.prisma.budget.findUniqueOrThrow({ where: { id: budget.id } }),
      ).resolves.toMatchObject({ name: 'Основной' });
    });
  });

  describe('POST /budgets/{id}/activate', () => {
    it('makes the budget active and leaves exactly one active among three', async () => {
      const { second } = await pair(USER);
      await harness.seedBudget(USER, { name: 'Третий', active: false });

      const response = await activate(USER, second.id, 'k1');

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({
        id: second.id,
        name: 'Второй',
        active: true,
      });
      await expect(activeNamesOf(USER)).resolves.toEqual(['Второй']);
      await expect(budgetsOf(USER)).resolves.toHaveLength(3);
    });

    it('turns every read to the budget that is active now, and back again', async () => {
      const { first, second } = await pair(USER);
      await harness.seedAccount(USER, first.id, { name: 'Кошелёк первого' });
      await harness.seedAccount(USER, second.id, { name: 'Карта второго' });
      const groupOfFirst = await harness.seedGroup(USER, first.id, 'Дом');
      await harness.seedCategory(USER, first.id, groupOfFirst.id, 'Кафе');
      const groupOfSecond = await harness.seedGroup(USER, second.id, 'Поездка');
      await harness.seedCategory(USER, second.id, groupOfSecond.id, 'Билеты');

      await expect(accountsOf(USER)).resolves.toEqual(['Кошелёк первого']);
      await expect(categoriesOf(USER)).resolves.toEqual(['Кафе']);

      await activate(USER, second.id, 'k1').expect(200);

      await expect(accountsOf(USER)).resolves.toEqual(['Карта второго']);
      await expect(categoriesOf(USER)).resolves.toEqual(['Билеты']);

      await activate(USER, first.id, 'k2').expect(200);

      await expect(accountsOf(USER)).resolves.toEqual(['Кошелёк первого']);
      await expect(categoriesOf(USER)).resolves.toEqual(['Кафе']);
    });

    it('answers 200 for the budget that is active already and changes nothing', async () => {
      const { first } = await pair(USER);
      const before = await budgetsOf(USER);

      const response = await activate(USER, first.id, 'k1');

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({ id: first.id, active: true });
      await expect(budgetsOf(USER)).resolves.toEqual(before);
    });

    it('activates one for a caller whose budgets are all inactive', async () => {
      const first = await harness.seedBudget(USER, { name: 'Первый', active: false });
      await harness.seedBudget(USER, { name: 'Второй', active: false });

      const response = await activate(USER, first.id, 'k1');

      expect(response.status).toBe(200);
      await expect(activeNamesOf(USER)).resolves.toEqual(['Первый']);
    });

    it('answers a repeated key with what that key did, and does not switch again', async () => {
      const { first, second } = await pair(USER);

      const switched = await activate(USER, second.id, 'k1');
      await activate(USER, first.id, 'k2').expect(200);
      const repeat = await activate(USER, second.id, 'k1');

      expect(repeat.status).toBe(200);
      expect(repeat.body).toEqual(switched.body);
      await expect(activeNamesOf(USER)).resolves.toEqual(['Первый']);
    });

    it('refuses a key that was claimed for another budget', async () => {
      const { first, second } = await pair(USER);
      await activate(USER, second.id, 'k1').expect(200);

      const response = await activate(USER, first.id, 'k1');

      expect(response.status).toBe(409);
      await expect(activeNamesOf(USER)).resolves.toEqual(['Второй']);
    });

    it('names the reason when the caller holds no such budget, and the active one stays', async () => {
      await pair(USER);

      const response = await activate(USER, UNKNOWN_ID, 'k1');

      expect(response.status).toBe(404);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_BUDGET');
      await expect(activeNamesOf(USER)).resolves.toEqual(['Первый']);
      await expect(keysOf(USER)).resolves.toBe(0);
    });

    it('answers 400 to an id that is not one', async () => {
      const response = await activate(USER, 'not-a-uuid', 'k1');

      expect(response.status).toBe(400);
    });

    it('answers 401 to an anonymous caller and switches nothing', async () => {
      const { second } = await pair(USER);

      const response = await request(harness.server())
        .post(`/budgets/${second.id}/activate`)
        .send({ idempotencyKey: 'k1' });

      expect(response.status).toBe(401);
      await expect(activeNamesOf(USER)).resolves.toEqual(['Первый']);
    });
  });

  describe('the day a budget was created', () => {
    const listed = async (userId: string): Promise<Record<string, unknown>[]> => {
      const response = await request(harness.server())
        .get('/budgets')
        .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
        .expect(200);

      return (response.body as unknown[]).map(asRecord);
    };

    it('is read in the budget’s own timezone, not in UTC', async () => {
      await harness.seedBudget(USER, {
        name: 'Ночной',
        timezone: 'Europe/Warsaw',
        createdAt: new Date('2026-01-31T23:30:00Z'),
      });

      const [budget] = await listed(USER);

      expect(budget).toMatchObject({ createdOn: '2026-02-01', firstMonth: '2026-02' });
    });

    it('does not move when the budget is renamed or made active', async () => {
      await harness.seedBudget(USER, { name: 'Первый' });
      const second = await harness.seedBudget(USER, {
        name: 'Второй',
        active: false,
        createdAt: new Date('2025-06-15T10:00:00Z'),
      });

      const renamed = await rename(USER, second.id, { name: 'Отпуск', idempotencyKey: 'k1' });
      const switched = await activate(USER, second.id, 'k2');

      expect(asRecord(renamed.body)['createdOn']).toBe('2025-06-15');
      expect(asRecord(switched.body)['createdOn']).toBe('2025-06-15');
    });
  });

  describe('one user never reaches another (ADR-005)', () => {
    it('refuses B renaming a budget of A’s, and no row of A’s changes', async () => {
      const { first } = await pair(USER_A);
      await harness.seedBudget(USER_B, { name: 'Личный B' });
      const before = await budgetsOf(USER_A);

      const response = await rename(USER_B, first.id, { name: 'Захвачен', idempotencyKey: 'k1' });

      expect(response.status).toBe(404);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_BUDGET');
      await expect(budgetsOf(USER_A)).resolves.toEqual(before);
    });

    it('refuses B activating a budget of A’s, and both keep the active budget they had', async () => {
      const { second } = await pair(USER_A);
      await harness.seedBudget(USER_B, { name: 'Личный B' });
      const before = await budgetsOf(USER_A);

      const response = await activate(USER_B, second.id, 'k1');

      expect(response.status).toBe(404);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_BUDGET');
      await expect(budgetsOf(USER_A)).resolves.toEqual(before);
      await expect(activeNamesOf(USER_B)).resolves.toEqual(['Личный B']);
    });

    it('leaves B’s active budget alone when A switches', async () => {
      const { second } = await pair(USER_A);
      await harness.seedBudget(USER_B, { name: 'Личный B' });

      await activate(USER_A, second.id, 'k1').expect(200);

      await expect(activeNamesOf(USER_B)).resolves.toEqual(['Личный B']);
    });
  });
});
