import { TransactionType } from '@rondo/db';
import { parseCalendarDate, toDbDate, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoEntryTenants';

const USER_MINE = `${USER_PREFIX}Mine`;
const USER_THEIRS = `${USER_PREFIX}Theirs`;

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

describe('what one tenant sees of another (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  const get = (userId: string, path: string) =>
    request(harness.server())
      .get(path)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`);

  const post = (userId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post('/transactions')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const patch = (userId: string, id: string, body: Record<string, unknown>) =>
    request(harness.server())
      .patch(`/transactions/${id}`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const remove = (userId: string, id: string) =>
    request(harness.server())
      .post(`/transactions/${id}/delete`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send({ idempotencyKey: 'delete-someone-elses' });

  const budgetOf = async (userId: string, payee: string) => {
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id, { createdAt: OPENED });
    const group = await harness.seedGroup(userId, budget.id, 'Повседневные');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

    const record = await harness.prisma.transaction.create({
      data: {
        userId,
        budgetId: budget.id,
        accountId: account.id,
        categoryId: category.id,
        date: toDbDate(parseCalendarDate(TODAY)),
        amount: -1000n,
        type: TransactionType.EXPENSE,
        payee,
      },
    });

    return { budget, account, category, record };
  };

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

  it('does not list another tenant’s records', async () => {
    await budgetOf(USER_MINE, 'Моя запись');
    await budgetOf(USER_THEIRS, 'Чужая запись');

    const answer = await get(USER_MINE, '/transactions').expect(200);
    const rows = (answer.body as { transactions: { payee: string | null }[] }).transactions;

    expect(rows.map((row) => row.payee)).toEqual(['Моя запись']);
  });

  it('does not suggest another tenant’s payees', async () => {
    await budgetOf(USER_MINE, 'Моя аптека');
    await budgetOf(USER_THEIRS, 'Чужая аптека');

    const answer = await get(USER_MINE, '/transactions/payees').expect(200);

    expect((answer.body as { payees: string[] }).payees).toEqual(['Моя аптека']);
  });

  it('does not let one tenant edit another’s record', async () => {
    const mine = await budgetOf(USER_MINE, 'Моя запись');
    const theirs = await budgetOf(USER_THEIRS, 'Чужая запись');

    const response = await patch(USER_MINE, theirs.record.id, {
      accountId: mine.account.id,
      categoryId: mine.category.id,
      type: 'EXPENSE',
      amount: '5000',
      date: TODAY,
      idempotencyKey: 'edit-someone-elses',
    });

    expect(response.status).toBe(400);
    expect((response.body as { reason?: string }).reason).toBe('UNKNOWN_TRANSACTION');

    const stored = await harness.prisma.transaction.findUniqueOrThrow({
      where: { id: theirs.record.id },
    });

    expect(stored).toMatchObject({ amount: -1000n, userId: USER_THEIRS });
  });

  it('does not let one tenant delete another’s record', async () => {
    await budgetOf(USER_MINE, 'Моя запись');
    const theirs = await budgetOf(USER_THEIRS, 'Чужая запись');

    const response = await remove(USER_MINE, theirs.record.id);

    expect(response.status).toBe(400);
    expect((response.body as { reason?: string }).reason).toBe('UNKNOWN_TRANSACTION');
    await expect(
      harness.prisma.transaction.count({ where: { id: theirs.record.id } }),
    ).resolves.toBe(1);
  });

  it('does not let one tenant write onto another’s account', async () => {
    const mine = await budgetOf(USER_MINE, 'Моя запись');
    const theirs = await budgetOf(USER_THEIRS, 'Чужая запись');

    const response = await post(USER_MINE, {
      accountId: theirs.account.id,
      categoryId: mine.category.id,
      type: 'EXPENSE',
      amount: '5000',
      date: TODAY,
      idempotencyKey: 'write-onto-someone-elses',
    });

    expect(response.status).toBe(400);
    expect((response.body as { reason?: string }).reason).toBe('UNKNOWN_ACCOUNT');
    await expect(
      harness.prisma.transaction.count({ where: { accountId: theirs.account.id } }),
    ).resolves.toBe(1);
  });
});
