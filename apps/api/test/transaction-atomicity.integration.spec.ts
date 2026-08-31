import { todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoOnce';

const USER_REPEATS = `${USER_PREFIX}Repeats`;
const USER_TOGETHER = `${USER_PREFIX}Together`;
const USER_CHANGED = `${USER_PREFIX}Changed`;
const USER_MOVED = `${USER_PREFIX}Moved`;
const USER_NEIGHBOUR = `${USER_PREFIX}Neighbour`;
const USER_TORN = `${USER_PREFIX}Torn`;

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

const KEY = 'form-opened-once';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

describe('one intent, one record (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  const post = (userId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post('/transactions')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const budgetOf = async (userId: string) => {
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id, { createdAt: OPENED });
    const group = await harness.seedGroup(userId, budget.id, 'Повседневные');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

    return { budget, account, group, category };
  };

  const entry = (
    accountId: string,
    categoryId: string,
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    accountId,
    categoryId,
    type: 'EXPENSE',
    amount: '120050',
    date: TODAY,
    payee: 'Кофейня на углу',
    idempotencyKey: KEY,
    ...over,
  });

  const rowsOf = async (userId: string) => ({
    transactions: await harness.prisma.transaction.count({ where: { userId } }),
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

  it('answers a repeat with the record the first request wrote', async () => {
    const { account, category } = await budgetOf(USER_REPEATS);

    const first = await post(USER_REPEATS, entry(account.id, category.id));
    const second = await post(USER_REPEATS, entry(account.id, category.id));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    await expect(rowsOf(USER_REPEATS)).resolves.toEqual({ transactions: 1, keys: 1 });
  });

  it('writes once when two requests carrying one key arrive together', async () => {
    const { account, category } = await budgetOf(USER_TOGETHER);

    const [first, second] = await Promise.all([
      post(USER_TOGETHER, entry(account.id, category.id)),
      post(USER_TOGETHER, entry(account.id, category.id)),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body).toEqual(first.body);
    await expect(rowsOf(USER_TOGETHER)).resolves.toEqual({ transactions: 1, keys: 1 });
  });

  it('refuses a key wearing a different intent, rather than answering for a write it never made', async () => {
    const { account, category } = await budgetOf(USER_CHANGED);

    await post(USER_CHANGED, entry(account.id, category.id)).expect(201);
    const second = await post(USER_CHANGED, entry(account.id, category.id, { amount: '999' }));

    expect(second.status).toBe(409);
    await expect(rowsOf(USER_CHANGED)).resolves.toMatchObject({ transactions: 1 });
  });

  it('refuses a repeated key aimed at a budget the caller has since left', async () => {
    const { budget, account, category } = await budgetOf(USER_MOVED);

    await post(USER_MOVED, entry(account.id, category.id)).expect(201);

    await harness.prisma.budget.update({ where: { id: budget.id }, data: { active: false } });
    const second = await harness.seedBudget(USER_MOVED, { name: 'Второй' });

    const repeat = await post(USER_MOVED, entry(account.id, category.id));

    expect(repeat.status).toBe(409);
    await expect(
      harness.prisma.transaction.count({ where: { userId: USER_MOVED, budgetId: second.id } }),
    ).resolves.toBe(0);
  });

  it('lets another person hold the same key, because a key belongs to its owner', async () => {
    const mine = await budgetOf(USER_REPEATS);
    const theirs = await budgetOf(USER_NEIGHBOUR);

    await post(USER_REPEATS, entry(mine.account.id, mine.category.id)).expect(201);
    const other = await post(USER_NEIGHBOUR, entry(theirs.account.id, theirs.category.id));

    expect(other.status).toBe(201);
    expect(asRecord(other.body)['id']).not.toBe('');
    await expect(rowsOf(USER_NEIGHBOUR)).resolves.toEqual({ transactions: 1, keys: 1 });
  });

  it('leaves neither the record nor the key when the domain refuses the write', async () => {
    const { budget, account, group } = await budgetOf(USER_TORN);
    const hidden = await harness.seedCategory(
      USER_TORN,
      budget.id,
      group.id,
      'Скрытая',
      1,
      new Date('2026-07-01T00:00:00Z'),
    );

    const response = await post(USER_TORN, entry(account.id, hidden.id));

    expect(response.status).toBe(400);
    await expect(rowsOf(USER_TORN)).resolves.toEqual({ transactions: 0, keys: 0 });
  });
});
