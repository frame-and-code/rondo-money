import { todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoPaired';

const USER_REPEATS = `${USER_PREFIX}Repeats`;
const USER_TOGETHER = `${USER_PREFIX}Together`;
const USER_CHANGED = `${USER_PREFIX}Changed`;
const USER_MOVED = `${USER_PREFIX}Moved`;

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

const KEY = 'form-opened-once';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

describe('one intent, one transfer (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  const post = (userId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post('/transfers')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const budgetOf = async (userId: string) => {
    const budget = await harness.seedBudget(userId);
    const wallet = await harness.seedAccount(userId, budget.id, {
      name: 'Кошелёк',
      createdAt: OPENED,
    });
    const card = await harness.seedAccount(userId, budget.id, {
      name: 'Карта',
      createdAt: OPENED,
    });

    return { budget, wallet, card };
  };

  const move = (
    fromAccountId: string,
    toAccountId: string,
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    fromAccountId,
    toAccountId,
    amount: '50000',
    date: TODAY,
    idempotencyKey: KEY,
    ...over,
  });

  const rowsOf = async (userId: string) => ({
    legs: await harness.prisma.transaction.count({ where: { userId } }),
    keys: await harness.prisma.idempotencyKey.count({ where: { userId } }),
  });

  beforeAll(async () => {
    harness = await startCategoryHarness(USER_PREFIX);
  });

  afterAll(async () => {
    await harness.removeFixtures();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.removeFixtures();
  });

  it('answers a repeat with the pair the first request wrote', async () => {
    const { wallet, card } = await budgetOf(USER_REPEATS);

    const first = await post(USER_REPEATS, move(wallet.id, card.id));
    const second = await post(USER_REPEATS, move(wallet.id, card.id));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    await expect(rowsOf(USER_REPEATS)).resolves.toEqual({ legs: 2, keys: 1 });
  });

  it('writes one pair when two requests carrying one key arrive together', async () => {
    const { wallet, card } = await budgetOf(USER_TOGETHER);

    const [first, second] = await Promise.all([
      post(USER_TOGETHER, move(wallet.id, card.id)),
      post(USER_TOGETHER, move(wallet.id, card.id)),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body).toEqual(first.body);
    await expect(rowsOf(USER_TOGETHER)).resolves.toEqual({ legs: 2, keys: 1 });
  });

  it('refuses a key wearing a different intent, rather than answering for a write it never made', async () => {
    const { wallet, card } = await budgetOf(USER_CHANGED);

    await post(USER_CHANGED, move(wallet.id, card.id)).expect(201);
    const second = await post(USER_CHANGED, move(wallet.id, card.id, { amount: '999' }));

    expect(second.status).toBe(409);
    await expect(rowsOf(USER_CHANGED)).resolves.toMatchObject({ legs: 2 });
  });

  it('refuses a repeated key aimed at a budget the caller has since left', async () => {
    const { budget, wallet, card } = await budgetOf(USER_MOVED);

    await post(USER_MOVED, move(wallet.id, card.id)).expect(201);

    await harness.prisma.budget.update({ where: { id: budget.id }, data: { active: false } });
    const second = await harness.seedBudget(USER_MOVED, { name: 'Второй' });

    const repeat = await post(USER_MOVED, move(wallet.id, card.id));

    expect(repeat.status).toBe(409);
    await expect(
      harness.prisma.transaction.count({ where: { userId: USER_MOVED, budgetId: second.id } }),
    ).resolves.toBe(0);
    expect(asRecord(repeat.body)['statusCode']).toBe(409);
  });
});
