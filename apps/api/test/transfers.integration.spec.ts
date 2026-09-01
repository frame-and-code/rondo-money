import { todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoLegs';

const USER_WRITES = `${USER_PREFIX}Writes`;
const USER_REFUSED = `${USER_PREFIX}Refused`;
const USER_EDITS = `${USER_PREFIX}Edits`;
const USER_REMOVES = `${USER_PREFIX}Removes`;
const USER_RACING = `${USER_PREFIX}Racing`;
const USER_STRANGER = `${USER_PREFIX}Stranger`;

const ZONE = 'Europe/Warsaw';

const DAY_MS = 86_400_000;

const OPENED = new Date('2020-01-01T09:00:00Z');

const LATER = new Date('2026-08-10T09:00:00Z');

const ARCHIVED = new Date('2026-08-20T00:00:00Z');

const dayAfter = (date: string): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const legOf = (body: unknown, side: 'from' | 'to'): Record<string, unknown> =>
  asRecord(asRecord(body)[side]);

interface AccountRow {
  id: string;
  balance: string;
}

interface AccountsAnswer {
  total: string;
  accounts: AccountRow[];
}

describe('/transfers (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

  const post = (userId: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post('/transfers')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

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

  const accountsOf = async (userId: string): Promise<AccountsAnswer> => {
    const answer = await request(harness.server())
      .get('/accounts')
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .expect(200);

    return answer.body as AccountsAnswer;
  };

  const balanceOf = (answer: AccountsAnswer, accountId: string): string =>
    answer.accounts.find((account) => account.id === accountId)?.balance ?? 'missing';

  const move = (
    fromAccountId: string,
    toAccountId: string,
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    fromAccountId,
    toAccountId,
    amount: '50000',
    date: TODAY,
    idempotencyKey: `form-opened-${Math.random().toString(36).slice(2)}`,
    ...over,
  });

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
    const group = await harness.seedGroup(userId, budget.id, 'Повседневные');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

    await harness.seedIncome(userId, budget.id, wallet.id, '2026-01-05', 300_000n);

    return { budget, wallet, card, group, category };
  };

  const rowsOf = (userId: string) => harness.prisma.transaction.findMany({ where: { userId } });

  const reasonOf = (body: unknown): unknown => asRecord(body)['reason'];

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

  describe('writing a transfer', () => {
    it('writes two legs under one identifier, mirrored, with no envelope on either', async () => {
      const { wallet, card } = await budgetOf(USER_WRITES);

      const written = await post(USER_WRITES, move(wallet.id, card.id)).expect(201);

      const legs = (await rowsOf(USER_WRITES)).filter((row) => row.transferId !== null);

      expect(legs).toHaveLength(2);
      expect(new Set(legs.map((leg) => leg.transferId)).size).toBe(1);
      expect(legs.map((leg) => leg.amount).sort()).toEqual([-50_000n, 50_000n]);
      expect(legs.every((leg) => leg.type === 'TRANSFER')).toBe(true);
      expect(legs.every((leg) => leg.categoryId === null)).toBe(true);
      expect(legs.every((leg) => leg.payee === null)).toBe(true);
      expect(legs.every((leg) => leg.isSystem === false)).toBe(true);

      const shared = legs[0]?.transferId ?? '';

      expect(asRecord(written.body)['transferId']).toBe(shared);
      expect(legOf(written.body, 'from')).toMatchObject({
        accountId: wallet.id,
        amount: '-50000',
        counterAccountId: card.id,
        type: 'TRANSFER',
        categoryId: null,
      });
      expect(legOf(written.body, 'to')).toMatchObject({
        accountId: card.id,
        amount: '50000',
        counterAccountId: wallet.id,
      });
      expect(
        new Set([legOf(written.body, 'from')['id'], legOf(written.body, 'to')['id']]).size,
      ).toBe(2);
    });

    it('moves the two balances in opposite directions and leaves the total where it was', async () => {
      const { wallet, card } = await budgetOf(USER_WRITES);

      const before = await accountsOf(USER_WRITES);
      await post(USER_WRITES, move(wallet.id, card.id)).expect(201);
      const after = await accountsOf(USER_WRITES);

      expect(balanceOf(after, wallet.id)).toBe('250000');
      expect(balanceOf(after, card.id)).toBe('50000');
      expect(after.total).toBe(before.total);
    });

    it('leaves ready to assign and every envelope exactly where they were', async () => {
      const { wallet, card } = await budgetOf(USER_WRITES);

      const before = await harness.viewOf(USER_WRITES, '2026-08');
      await post(USER_WRITES, move(wallet.id, card.id)).expect(201);
      const after = await harness.viewOf(USER_WRITES, '2026-08');

      expect(after.readyToAssign).toBe(before.readyToAssign);
      expect(after.groups).toEqual(before.groups);
    });
  });

  describe('what a transfer is refused for', () => {
    it('refuses one account named twice', async () => {
      const { wallet } = await budgetOf(USER_REFUSED);

      const answer = await post(USER_REFUSED, move(wallet.id, wallet.id));

      expect(answer.status).toBe(400);
      expect(reasonOf(answer.body)).toBe('SAME_ACCOUNT');
      await expect(rowsOf(USER_REFUSED)).resolves.toHaveLength(1);
    });

    it('refuses an account this budget does not hold', async () => {
      const { wallet } = await budgetOf(USER_REFUSED);
      const stranger = await budgetOf(USER_STRANGER);

      const unknown = await post(
        USER_REFUSED,
        move(wallet.id, '0199c1a8-9ecf-71c7-a617-c575df073999'),
      );
      const someoneElses = await post(USER_REFUSED, move(wallet.id, stranger.card.id));

      expect(unknown.status).toBe(400);
      expect(reasonOf(unknown.body)).toBe('UNKNOWN_ACCOUNT');
      expect(someoneElses.status).toBe(400);
      expect(reasonOf(someoneElses.body)).toBe('UNKNOWN_ACCOUNT');
    });

    it('refuses an archived account on either side', async () => {
      const { budget, wallet, card } = await budgetOf(USER_REFUSED);
      const closed = await harness.seedAccount(USER_REFUSED, budget.id, {
        name: 'Старый счёт',
        createdAt: OPENED,
        archivedAt: ARCHIVED,
      });

      const leaving = await post(USER_REFUSED, move(closed.id, card.id));
      const arriving = await post(USER_REFUSED, move(wallet.id, closed.id));

      expect(leaving.status).toBe(400);
      expect(reasonOf(leaving.body)).toBe('ACCOUNT_ARCHIVED');
      expect(arriving.status).toBe(400);
      expect(reasonOf(arriving.body)).toBe('ACCOUNT_ARCHIVED');
    });

    it('refuses tomorrow, because money is recorded after it moves', async () => {
      const { wallet, card } = await budgetOf(USER_REFUSED);

      const answer = await post(USER_REFUSED, move(wallet.id, card.id, { date: dayAfter(TODAY) }));

      expect(answer.status).toBe(400);
      expect(reasonOf(answer.body)).toBe('DATE_IN_FUTURE');
    });

    it('refuses a day before the later of the two accounts was opened, and takes that day', async () => {
      const { budget, wallet } = await budgetOf(USER_REFUSED);
      const young = await harness.seedAccount(USER_REFUSED, budget.id, {
        name: 'Новый счёт',
        createdAt: LATER,
      });

      const early = await post(USER_REFUSED, move(wallet.id, young.id, { date: '2026-08-09' }));
      const opening = await post(USER_REFUSED, move(wallet.id, young.id, { date: '2026-08-10' }));

      expect(early.status).toBe(400);
      expect(reasonOf(early.body)).toBe('DATE_BEFORE_ACCOUNT');
      expect(opening.status).toBe(201);
    });

    it('refuses an amount of nothing and an amount below zero, before the domain is asked', async () => {
      const { wallet, card } = await budgetOf(USER_REFUSED);

      const nothing = await post(USER_REFUSED, move(wallet.id, card.id, { amount: '0' }));
      const below = await post(USER_REFUSED, move(wallet.id, card.id, { amount: '-1' }));

      expect(nothing.status).toBe(400);
      expect(reasonOf(nothing.body)).toBeUndefined();
      expect(below.status).toBe(400);
      expect(reasonOf(below.body)).toBeUndefined();
    });

    it('refuses a caller with no active budget rather than answering with a server error', async () => {
      const answer = await post(
        USER_REFUSED,
        move('0199c1a8-9ecf-71c7-a617-c575df073991', '0199c1a8-9ecf-71c7-a617-c575df073992'),
      );

      expect(answer.status).toBe(400);
      expect(reasonOf(answer.body)).toBe('NO_ACTIVE_BUDGET');
    });
  });

  describe('changing a transfer', () => {
    it('rewrites both legs when the amount and the day change', async () => {
      const { wallet, card } = await budgetOf(USER_EDITS);
      const written = await post(USER_EDITS, move(wallet.id, card.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);

      const changed = await patch(
        USER_EDITS,
        transferId,
        move(wallet.id, card.id, { amount: '70000', date: '2026-08-11' }),
      ).expect(200);

      const legs = await rowsOf(USER_EDITS);
      const pair = legs.filter((leg) => leg.transferId === transferId);

      expect(pair.map((leg) => leg.amount).sort()).toEqual([-70_000n, 70_000n]);
      expect(pair.every((leg) => leg.date.toISOString().startsWith('2026-08-11'))).toBe(true);
      expect(legOf(changed.body, 'from')['amount']).toBe('-70000');
      expect(legOf(changed.body, 'to')['amount']).toBe('70000');
    });

    it('moves one leg to a third account, and swaps the two, with the balances following', async () => {
      const { budget, wallet, card } = await budgetOf(USER_EDITS);
      const savings = await harness.seedAccount(USER_EDITS, budget.id, {
        name: 'Накопления',
        createdAt: OPENED,
      });
      const written = await post(USER_EDITS, move(wallet.id, card.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);

      await patch(USER_EDITS, transferId, move(wallet.id, savings.id)).expect(200);

      const third = await accountsOf(USER_EDITS);
      expect(balanceOf(third, card.id)).toBe('0');
      expect(balanceOf(third, savings.id)).toBe('50000');
      expect(balanceOf(third, wallet.id)).toBe('250000');

      await patch(USER_EDITS, transferId, move(savings.id, wallet.id)).expect(200);

      const swapped = await accountsOf(USER_EDITS);
      expect(balanceOf(swapped, savings.id)).toBe('-50000');
      expect(balanceOf(swapped, wallet.id)).toBe('350000');
    });

    it('refuses an account the budget does not hold rather than failing on the foreign key', async () => {
      const { wallet, card } = await budgetOf(USER_EDITS);
      const written = await post(USER_EDITS, move(wallet.id, card.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);

      const answer = await patch(
        USER_EDITS,
        transferId,
        move(wallet.id, '0199c1a8-9ecf-71c7-a617-c575df073998'),
      );

      expect(answer.status).toBe(400);
      expect(reasonOf(answer.body)).toBe('UNKNOWN_ACCOUNT');
    });

    it('runs every rule the write ran, and leaves both legs alone when one refuses', async () => {
      const { budget, wallet, card } = await budgetOf(USER_EDITS);
      const young = await harness.seedAccount(USER_EDITS, budget.id, {
        name: 'Новый счёт',
        createdAt: LATER,
      });
      const written = await post(USER_EDITS, move(wallet.id, card.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);
      const before = await rowsOf(USER_EDITS);

      const future = await patch(
        USER_EDITS,
        transferId,
        move(wallet.id, card.id, { date: dayAfter(TODAY) }),
      );
      const early = await patch(
        USER_EDITS,
        transferId,
        move(wallet.id, young.id, { date: '2026-08-09' }),
      );
      const itself = await patch(USER_EDITS, transferId, move(wallet.id, wallet.id));

      expect(reasonOf(future.body)).toBe('DATE_IN_FUTURE');
      expect(reasonOf(early.body)).toBe('DATE_BEFORE_ACCOUNT');
      expect(reasonOf(itself.body)).toBe('SAME_ACCOUNT');
      await expect(rowsOf(USER_EDITS)).resolves.toEqual(before);
    });

    it('refuses a pair whose other leg sits on an archived account, and one aimed onto one', async () => {
      const { budget, wallet, card } = await budgetOf(USER_EDITS);
      const closed = await harness.seedAccount(USER_EDITS, budget.id, {
        name: 'Старый счёт',
        createdAt: OPENED,
      });
      const written = await post(USER_EDITS, move(wallet.id, closed.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);
      await harness.prisma.account.update({
        where: { id: closed.id },
        data: { archivedAt: ARCHIVED },
      });
      const before = await rowsOf(USER_EDITS);

      const held = await patch(
        USER_EDITS,
        transferId,
        move(wallet.id, closed.id, { amount: '60000' }),
      );

      expect(held.status).toBe(400);
      expect(reasonOf(held.body)).toBe('ACCOUNT_ARCHIVED');

      const active = await post(USER_EDITS, move(wallet.id, card.id)).expect(201);
      const other = String(asRecord(active.body)['transferId']);

      const aimed = await patch(USER_EDITS, other, move(wallet.id, closed.id));

      expect(aimed.status).toBe(400);
      expect(reasonOf(aimed.body)).toBe('ACCOUNT_ARCHIVED');
      await expect(
        harness.prisma.transaction.findMany({ where: { userId: USER_EDITS, transferId } }),
      ).resolves.toEqual(before.filter((leg) => leg.transferId === transferId));
    });

    it('refuses a transfer this budget does not hold', async () => {
      const { wallet, card } = await budgetOf(USER_EDITS);
      const absent = '0199c1a8-9ecf-71c7-a617-c575df073997';

      const changed = await patch(USER_EDITS, absent, move(wallet.id, card.id));
      const removed = await remove(USER_EDITS, absent, { idempotencyKey: 'gone' });

      expect(changed.status).toBe(400);
      expect(reasonOf(changed.body)).toBe('UNKNOWN_TRANSFER');
      expect(removed.status).toBe(400);
      expect(reasonOf(removed.body)).toBe('UNKNOWN_TRANSFER');
    });

    it('refuses to touch a pair that is not two legs, and writes nothing while refusing', async () => {
      const { budget, wallet, card } = await budgetOf(USER_EDITS);
      const lone = '0199c1a8-9ecf-71c7-a617-c575df073996';
      await harness.prisma.transaction.create({
        data: {
          userId: USER_EDITS,
          budgetId: budget.id,
          accountId: wallet.id,
          date: new Date('2026-08-11T00:00:00Z'),
          amount: -5_000n,
          type: 'TRANSFER',
          transferId: lone,
        },
      });
      const before = await rowsOf(USER_EDITS);

      const changed = await patch(USER_EDITS, lone, move(wallet.id, card.id));
      const removed = await remove(USER_EDITS, lone, { idempotencyKey: 'torn' });

      expect(changed.status).toBe(500);
      expect(removed.status).toBe(500);
      await expect(rowsOf(USER_EDITS)).resolves.toEqual(before);
    });
  });

  describe('removing a transfer', () => {
    it('takes both legs away and gives both balances back', async () => {
      const { wallet, card } = await budgetOf(USER_REMOVES);
      const before = await accountsOf(USER_REMOVES);
      const written = await post(USER_REMOVES, move(wallet.id, card.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);

      const gone = await remove(USER_REMOVES, transferId, { idempotencyKey: 'confirm-opened' });

      expect(gone.status).toBe(200);
      expect(legOf(gone.body, 'from')['accountId']).toBe(wallet.id);
      await expect(
        harness.prisma.transaction.count({ where: { userId: USER_REMOVES, transferId } }),
      ).resolves.toBe(0);

      const after = await accountsOf(USER_REMOVES);
      expect(balanceOf(after, wallet.id)).toBe(balanceOf(before, wallet.id));
      expect(balanceOf(after, card.id)).toBe(balanceOf(before, card.id));
    });

    it('refuses to remove a pair with a leg on an archived account, and keeps both legs', async () => {
      const { budget, wallet } = await budgetOf(USER_REMOVES);
      const closed = await harness.seedAccount(USER_REMOVES, budget.id, {
        name: 'Старый счёт',
        createdAt: OPENED,
      });
      const written = await post(USER_REMOVES, move(wallet.id, closed.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);
      await harness.prisma.account.update({
        where: { id: closed.id },
        data: { archivedAt: ARCHIVED },
      });

      const answer = await remove(USER_REMOVES, transferId, { idempotencyKey: 'confirm-closed' });

      expect(answer.status).toBe(400);
      expect(reasonOf(answer.body)).toBe('ACCOUNT_ARCHIVED');
      await expect(
        harness.prisma.transaction.count({ where: { userId: USER_REMOVES, transferId } }),
      ).resolves.toBe(2);
    });
  });

  describe('two edits of one pair at once', () => {
    it('answers both without deadlocking, and leaves the pair under one of the two intents', async () => {
      const { wallet, card } = await budgetOf(USER_RACING);
      const written = await post(USER_RACING, move(wallet.id, card.id)).expect(201);
      const transferId = String(asRecord(written.body)['transferId']);

      for (const round of [0, 1, 2, 3]) {
        const answers = await Promise.all([
          patch(USER_RACING, transferId, {
            fromAccountId: wallet.id,
            toAccountId: card.id,
            amount: '11000',
            date: '2026-08-11',
            idempotencyKey: `there-${round}`,
          }),
          patch(USER_RACING, transferId, {
            fromAccountId: card.id,
            toAccountId: wallet.id,
            amount: '22000',
            date: '2026-08-12',
            idempotencyKey: `back-${round}`,
          }),
        ]);

        expect(answers.map((answer) => answer.status)).toEqual([200, 200]);

        const pair = await harness.prisma.transaction.findMany({
          where: { userId: USER_RACING, transferId },
          orderBy: { amount: 'asc' },
        });

        expect(pair).toHaveLength(2);

        const there =
          pair[0]?.amount === -11_000n &&
          pair[0]?.accountId === wallet.id &&
          pair[1]?.amount === 11_000n &&
          pair[1]?.accountId === card.id &&
          pair.every((leg) => leg.date.toISOString().startsWith('2026-08-11'));
        const back =
          pair[0]?.amount === -22_000n &&
          pair[0]?.accountId === card.id &&
          pair[1]?.amount === 22_000n &&
          pair[1]?.accountId === wallet.id &&
          pair.every((leg) => leg.date.toISOString().startsWith('2026-08-12'));

        expect(there || back).toBe(true);
      }
    });
  });
});
