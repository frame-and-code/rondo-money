import { todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoBorders';

const USER_OWNER = `${USER_PREFIX}Owner`;
const USER_OTHER = `${USER_PREFIX}Other`;

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

describe('a transfer belongs to the person who made it (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  const patch = (userId: string, transferId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .patch(`/transfers/${transferId}`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const remove = (userId: string, transferId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(`/transfers/${transferId}/delete`)
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

  it('refuses to let another person change it, and leaves both legs untouched', async () => {
    const mine = await budgetOf(USER_OWNER);
    const theirs = await budgetOf(USER_OTHER);
    const pair = await harness.seedTransfer(
      USER_OWNER,
      mine.budget.id,
      { fromAccountId: mine.wallet.id, toAccountId: mine.card.id },
      TODAY,
      50_000n,
    );
    const before = await harness.prisma.transaction.findMany({ where: { userId: USER_OWNER } });

    const answer = await patch(USER_OTHER, pair.transferId, {
      fromAccountId: theirs.wallet.id,
      toAccountId: theirs.card.id,
      amount: '90000',
      date: TODAY,
      idempotencyKey: 'not-mine',
    });

    expect(answer.status).toBe(400);
    await expect(
      harness.prisma.transaction.findMany({ where: { userId: USER_OWNER } }),
    ).resolves.toEqual(before);
  });

  it('refuses to let another person remove it, and leaves both legs where they are', async () => {
    const mine = await budgetOf(USER_OWNER);
    await budgetOf(USER_OTHER);
    const pair = await harness.seedTransfer(
      USER_OWNER,
      mine.budget.id,
      { fromAccountId: mine.wallet.id, toAccountId: mine.card.id },
      TODAY,
      50_000n,
    );

    const answer = await remove(USER_OTHER, pair.transferId, { idempotencyKey: 'not-mine-either' });

    expect(answer.status).toBe(400);
    await expect(harness.prisma.transaction.count({ where: { userId: USER_OWNER } })).resolves.toBe(
      2,
    );
  });
});
