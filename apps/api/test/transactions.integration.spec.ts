import { TransactionType } from '@rondo/db';
import { monthOf, parseCalendarDate, toDbDate, todayIn } from '@rondo/types';
import request from 'supertest';

import { startCategoryHarness, type CategoryHarness } from './category-harness';

const USER_PREFIX = 'user_2rondoEntries';

const USER_WRITES = `${USER_PREFIX}Writes`;
const USER_REFUSED = `${USER_PREFIX}Refused`;
const USER_EDITS = `${USER_PREFIX}Edits`;
const USER_REMOVES = `${USER_PREFIX}Removes`;
const USER_NAMES = `${USER_PREFIX}Names`;
const USER_COUNTS = `${USER_PREFIX}Counts`;

const ZONE = 'Europe/Warsaw';

const DAY_MS = 86_400_000;

const OPENED = new Date('2020-01-01T09:00:00Z');

const dayAfter = (date: string): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

const dayBefore = (date: string): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

describe('/transactions (integration)', () => {
  let harness: CategoryHarness;

  const TODAY = todayIn(ZONE);

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

  const remove = (userId: string, id: string, body: Record<string, unknown>) =>
    request(harness.server())
      .post(`/transactions/${id}/delete`)
      .set('Authorization', `Bearer ${harness.tokenFor(userId)}`)
      .send(body);

  const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'EXPENSE',
    amount: '120050',
    date: TODAY,
    payee: 'Кофейня на углу',
    idempotencyKey: `form-opened-${Math.random().toString(36).slice(2)}`,
    ...over,
  });

  const budgetOf = async (userId: string) => {
    const budget = await harness.seedBudget(userId);
    const account = await harness.seedAccount(userId, budget.id, { createdAt: OPENED });
    const group = await harness.seedGroup(userId, budget.id, 'Повседневные');
    const category = await harness.seedCategory(userId, budget.id, group.id, 'Кафе');

    return { budget, account, group, category };
  };

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

  describe('writing a record', () => {
    it('stores an expense as money that left the account', async () => {
      const { account, category } = await budgetOf(USER_WRITES);

      const response = await post(
        USER_WRITES,
        entry({ accountId: account.id, categoryId: category.id }),
      );
      expect(response.status).toBe(201);

      const stored = await harness.prisma.transaction.findFirstOrThrow({
        where: { userId: USER_WRITES },
      });

      expect(stored).toMatchObject({
        accountId: account.id,
        categoryId: category.id,
        amount: -120050n,
        type: TransactionType.EXPENSE,
        payee: 'Кофейня на углу',
        isSystem: false,
        transferId: null,
      });
    });

    it('stores income as money that arrived, from the same positive amount', async () => {
      const { account } = await budgetOf(USER_WRITES);

      await post(
        USER_WRITES,
        entry({ accountId: account.id, type: 'INCOME', categoryId: undefined }),
      ).expect(201);

      const stored = await harness.prisma.transaction.findFirstOrThrow({
        where: { userId: USER_WRITES },
      });

      expect(stored).toMatchObject({ amount: 120050n, type: TransactionType.INCOME });
    });

    it('lets income carry no category, which leaves the money ready to assign', async () => {
      const { account } = await budgetOf(USER_WRITES);

      await post(
        USER_WRITES,
        entry({ accountId: account.id, type: 'INCOME', amount: '50000', categoryId: undefined }),
      ).expect(201);

      const view = await harness.viewOf(USER_WRITES, monthOf(TODAY));

      expect(view.readyToAssign).toBe('50000');
    });
  });

  describe('refusing a record the domain cannot hold', () => {
    it('refuses an amount of nothing, which would record no movement', async () => {
      const { account, category } = await budgetOf(USER_REFUSED);

      await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id, amount: '0' }),
      ).expect(400);
    });

    it('refuses a signed amount, because the direction is the type rather than the number', async () => {
      const { account, category } = await budgetOf(USER_REFUSED);

      await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id, amount: '-120050' }),
      ).expect(400);
    });

    it('refuses tomorrow', async () => {
      const { account, category } = await budgetOf(USER_REFUSED);

      const response = await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id, date: dayAfter(TODAY) }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('DATE_IN_FUTURE');
    });

    it('refuses a day the account did not exist on', async () => {
      const budget = await harness.seedBudget(USER_REFUSED);
      const account = await harness.seedAccount(USER_REFUSED, budget.id, {
        createdAt: new Date(`${TODAY}T09:00:00Z`),
      });
      const group = await harness.seedGroup(USER_REFUSED, budget.id, 'Повседневные');
      const category = await harness.seedCategory(USER_REFUSED, budget.id, group.id, 'Кафе');

      const response = await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id, date: dayBefore(TODAY) }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('DATE_BEFORE_ACCOUNT');
    });

    it('refuses an expense that names no category', async () => {
      const { account } = await budgetOf(USER_REFUSED);

      const response = await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: undefined }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('CATEGORY_REQUIRED');
    });

    it('refuses a hidden category, which takes no new money', async () => {
      const budget = await harness.seedBudget(USER_REFUSED);
      const account = await harness.seedAccount(USER_REFUSED, budget.id, { createdAt: OPENED });
      const group = await harness.seedGroup(USER_REFUSED, budget.id, 'Повседневные');
      const category = await harness.seedCategory(
        USER_REFUSED,
        budget.id,
        group.id,
        'Кафе',
        0,
        new Date('2026-07-01T00:00:00Z'),
      );

      const response = await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('CATEGORY_HIDDEN');
    });

    it('refuses an archived account', async () => {
      const budget = await harness.seedBudget(USER_REFUSED);
      const account = await harness.seedAccount(USER_REFUSED, budget.id, {
        createdAt: OPENED,
        archivedAt: new Date('2026-08-01T00:00:00Z'),
      });
      const group = await harness.seedGroup(USER_REFUSED, budget.id, 'Повседневные');
      const category = await harness.seedCategory(USER_REFUSED, budget.id, group.id, 'Кафе');

      const response = await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('ACCOUNT_ARCHIVED');
    });

    it('refuses a transfer, which exists only as a pair and is written by its own operation', async () => {
      const { account, category } = await budgetOf(USER_REFUSED);

      await post(
        USER_REFUSED,
        entry({ accountId: account.id, categoryId: category.id, type: 'TRANSFER' }),
      ).expect(400);
    });
  });

  describe('editing a record', () => {
    it('moves it to another account and changes its type at once', async () => {
      const { budget, account, category } = await budgetOf(USER_EDITS);
      const other = await harness.seedAccount(USER_EDITS, budget.id, {
        name: 'Карта',
        createdAt: OPENED,
      });

      const written = await post(
        USER_EDITS,
        entry({ accountId: account.id, categoryId: category.id }),
      ).expect(201);

      const id = String(asRecord(written.body)['id']);

      await patch(
        USER_EDITS,
        id,
        entry({ accountId: other.id, type: 'INCOME', amount: '9000', categoryId: undefined }),
      ).expect(200);

      const stored = await harness.prisma.transaction.findUniqueOrThrow({ where: { id } });

      expect(stored).toMatchObject({
        accountId: other.id,
        categoryId: null,
        amount: 9000n,
        type: TransactionType.INCOME,
      });
    });

    it('runs the rules of the type it becomes, so an expense still needs a category', async () => {
      const { account } = await budgetOf(USER_EDITS);

      const written = await post(
        USER_EDITS,
        entry({ accountId: account.id, type: 'INCOME', categoryId: undefined }),
      ).expect(201);

      const id = String(asRecord(written.body)['id']);

      const response = await patch(
        USER_EDITS,
        id,
        entry({ accountId: account.id, type: 'EXPENSE', categoryId: undefined }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('CATEGORY_REQUIRED');
    });

    it('refuses a move onto an archived account', async () => {
      const { budget, account, category } = await budgetOf(USER_EDITS);
      const closed = await harness.seedAccount(USER_EDITS, budget.id, {
        name: 'Старый счёт',
        createdAt: OPENED,
        archivedAt: new Date('2026-08-01T00:00:00Z'),
      });

      const written = await post(
        USER_EDITS,
        entry({ accountId: account.id, categoryId: category.id }),
      ).expect(201);

      const id = String(asRecord(written.body)['id']);

      const response = await patch(
        USER_EDITS,
        id,
        entry({ accountId: closed.id, categoryId: category.id }),
      );

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('ACCOUNT_ARCHIVED');
    });

    it('lets an old record keep a category hidden after it was written', async () => {
      const { budget, account, category } = await budgetOf(USER_EDITS);

      const written = await post(
        USER_EDITS,
        entry({ accountId: account.id, categoryId: category.id }),
      ).expect(201);

      const id = String(asRecord(written.body)['id']);

      await harness.prisma.category.update({
        where: { id: category.id },
        data: { hiddenAt: new Date() },
      });

      await patch(
        USER_EDITS,
        id,
        entry({ accountId: account.id, categoryId: category.id, amount: '99900' }),
      ).expect(200);

      const stored = await harness.prisma.transaction.findUniqueOrThrow({ where: { id } });

      expect(stored).toMatchObject({ amount: -99900n, budgetId: budget.id });
    });
  });

  describe('deleting a record', () => {
    it('removes the row rather than marking it, and gives the money back', async () => {
      const { account, category } = await budgetOf(USER_REMOVES);

      const written = await post(
        USER_REMOVES,
        entry({ accountId: account.id, categoryId: category.id }),
      ).expect(201);

      const id = String(asRecord(written.body)['id']);

      await remove(USER_REMOVES, id, { idempotencyKey: 'delete-pressed-once' }).expect(200);

      expect(await harness.prisma.transaction.count({ where: { userId: USER_REMOVES } })).toBe(0);
    });

    it('refuses the opening balance, which belongs to the account rather than to a person', async () => {
      const { budget, account } = await budgetOf(USER_REMOVES);
      const opening = await harness.prisma.transaction.create({
        data: {
          userId: USER_REMOVES,
          budgetId: budget.id,
          accountId: account.id,
          date: toDbDate(parseCalendarDate(TODAY)),
          amount: 100000n,
          type: TransactionType.INCOME,
          isSystem: true,
        },
      });

      const response = await remove(USER_REMOVES, opening.id, { idempotencyKey: 'delete-system' });

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('NOT_EDITABLE');
    });

    it('refuses one leg of a transfer, which is deleted as a pair', async () => {
      const { budget, account } = await budgetOf(USER_REMOVES);
      const other = await harness.seedAccount(USER_REMOVES, budget.id, {
        name: 'Карта',
        createdAt: OPENED,
      });
      const transferId = '0199c1a8-9ecf-71c7-a617-c575df073911';

      const leg = await harness.prisma.transaction.create({
        data: {
          userId: USER_REMOVES,
          budgetId: budget.id,
          accountId: account.id,
          date: toDbDate(parseCalendarDate(TODAY)),
          amount: -5000n,
          type: TransactionType.TRANSFER,
          transferId,
        },
      });
      await harness.prisma.transaction.create({
        data: {
          userId: USER_REMOVES,
          budgetId: budget.id,
          accountId: other.id,
          date: toDbDate(parseCalendarDate(TODAY)),
          amount: 5000n,
          type: TransactionType.TRANSFER,
          transferId,
        },
      });

      const response = await remove(USER_REMOVES, leg.id, { idempotencyKey: 'delete-leg' });

      expect(response.status).toBe(400);
      expect(reasonOf(response.body)).toBe('NOT_EDITABLE');
      expect(await harness.prisma.transaction.count({ where: { userId: USER_REMOVES } })).toBe(2);
    });
  });

  describe('the payee', () => {
    it('takes a name of a hundred characters and refuses one longer', async () => {
      const { account, category } = await budgetOf(USER_NAMES);

      await post(
        USER_NAMES,
        entry({ accountId: account.id, categoryId: category.id, payee: 'к'.repeat(100) }),
      ).expect(201);

      await post(
        USER_NAMES,
        entry({ accountId: account.id, categoryId: category.id, payee: 'к'.repeat(101) }),
      ).expect(400);
    });

    it('stores a record with no payee rather than an empty name', async () => {
      const { account, category } = await budgetOf(USER_NAMES);

      await post(
        USER_NAMES,
        entry({ accountId: account.id, categoryId: category.id, payee: '  ' }),
      ).expect(201);

      const stored = await harness.prisma.transaction.findFirstOrThrow({
        where: { userId: USER_NAMES },
      });

      expect(stored.payee).toBeNull();
    });
  });

  describe('what the rest of the budget sees', () => {
    it('counts an expense in the category activity and in the account balance', async () => {
      const { account, category } = await budgetOf(USER_COUNTS);

      await post(
        USER_COUNTS,
        entry({ accountId: account.id, categoryId: category.id, amount: '30000' }),
      ).expect(201);

      const view = await harness.viewOf(USER_COUNTS, monthOf(TODAY));
      const spent = view.groups
        .flatMap((group) => group.categories)
        .find((candidate) => candidate.id === category.id);

      expect(spent?.activity).toBe('-30000');

      const accounts = await request(harness.server())
        .get('/accounts')
        .set('Authorization', `Bearer ${harness.tokenFor(USER_COUNTS)}`)
        .expect(200);

      expect(asRecord(accounts.body)['total']).toBe('-30000');
    });

    it('keeps a record written on the first of a month in that month, not the one before', async () => {
      const { account, category } = await budgetOf(USER_COUNTS);
      const first = `${monthOf(TODAY)}-01`;

      const written = await post(
        USER_COUNTS,
        entry({ accountId: account.id, categoryId: category.id, amount: '4000', date: first }),
      ).expect(201);

      expect(asRecord(written.body)['date']).toBe(first);

      const view = await harness.viewOf(USER_COUNTS, monthOf(TODAY));
      const spent = view.groups
        .flatMap((group) => group.categories)
        .find((candidate) => candidate.id === category.id);

      expect(spent?.activity).toBe('-4000');
    });
  });

  describe('the opening balance', () => {
    const openingOf = async (userId: string, budgetId: string, accountId: string) =>
      harness.prisma.transaction.create({
        data: {
          userId,
          budgetId,
          accountId,
          date: toDbDate(parseCalendarDate(TODAY)),
          amount: 100000n,
          type: TransactionType.INCOME,
          isSystem: true,
        },
      });

    it('takes a correction of its amount, because an account is opened with a guess', async () => {
      const { budget, account } = await budgetOf(USER_EDITS);
      const opening = await openingOf(USER_EDITS, budget.id, account.id);

      await patch(USER_EDITS, opening.id, {
        accountId: account.id,
        type: 'INCOME',
        amount: '133700',
        date: TODAY,
        idempotencyKey: 'correct-the-opening-balance',
      }).expect(200);

      const stored = await harness.prisma.transaction.findUniqueOrThrow({
        where: { id: opening.id },
      });

      expect(stored).toMatchObject({ amount: 133700n, isSystem: true, categoryId: null });
    });

    it('refuses to turn the opening balance into an expense, which would negate it', async () => {
      const { budget, account } = await budgetOf(USER_EDITS);
      const opening = await openingOf(USER_EDITS, budget.id, account.id);

      const answer = await patch(USER_EDITS, opening.id, {
        accountId: account.id,
        type: 'EXPENSE',
        amount: '133700',
        date: TODAY,
        idempotencyKey: 'negate-the-opening-balance',
      }).expect(400);

      expect(answer.body).toMatchObject({ reason: 'NOT_EDITABLE' });

      const stored = await harness.prisma.transaction.findUniqueOrThrow({
        where: { id: opening.id },
      });

      expect(stored.amount > 0n).toBe(true);
    });

    it('refuses every other field, or the account is left without an opening balance', async () => {
      const { budget, account, category } = await budgetOf(USER_EDITS);
      const other = await harness.seedAccount(USER_EDITS, budget.id, {
        name: 'Карта',
        createdAt: OPENED,
      });
      const opening = await openingOf(USER_EDITS, budget.id, account.id);

      const moved = await patch(USER_EDITS, opening.id, {
        accountId: other.id,
        type: 'INCOME',
        amount: '100000',
        date: TODAY,
        idempotencyKey: 'move-the-opening-balance',
      });

      expect(moved.status).toBe(400);
      expect(reasonOf(moved.body)).toBe('NOT_EDITABLE');

      const filed = await patch(USER_EDITS, opening.id, {
        accountId: account.id,
        categoryId: category.id,
        type: 'INCOME',
        amount: '100000',
        date: TODAY,
        idempotencyKey: 'file-the-opening-balance',
      });

      expect(filed.status).toBe(400);
      expect(reasonOf(filed.body)).toBe('NOT_EDITABLE');
    });
  });
});
