import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionType } from '@rondo/db';
import { isMoveRefusal, toDbDate } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoMoves';

const user = (suffix: string): string => `${USER_PREFIX}${suffix}`;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

interface ViewCategory {
  id: string;
  assigned: string;
  activity: string;
  available: string;
}

interface View {
  readyToAssign: string;
  groups: { categories: ViewCategory[] }[];
}

describe('/moves (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const move = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/moves')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const viewOf = async (userId: string, month: string): Promise<View> => {
    const response = await request(app.getHttpServer() as Server)
      .get(`/budget-view?month=${month}`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .expect(200);

    return response.body as View;
  };

  const categoryIn = (view: View, categoryId: string): ViewCategory => {
    const found = view.groups
      .flatMap((group) => group.categories)
      .find((category) => category.id === categoryId);
    if (!found) {
      throw new Error(`The view carries no category ${categoryId}`);
    }

    return found;
  };

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedBudget = (userId: string, over: Record<string, unknown> = {}) =>
    prisma.budget.create({
      data: {
        userId,
        name: 'Основной',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
        ...over,
      },
    });

  const seedGroup = (userId: string, budgetId: string) =>
    prisma.categoryGroup.create({ data: { userId, budgetId, name: 'Дом', sortOrder: 0 } });

  const seedCategory = (
    userId: string,
    budgetId: string,
    groupId: string,
    name: string,
    over: Record<string, unknown> = {},
  ) =>
    prisma.category.create({
      data: { userId, budgetId, groupId, name, sortOrder: 0, ...over },
    });

  const seedUncategorisedIncome = (
    userId: string,
    budgetId: string,
    accountId: string,
    amount: bigint,
  ) =>
    prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId,
        date: toDbDate('2026-01-05'),
        amount,
        type: TransactionType.INCOME,
      },
    });

  const seedAccount = (userId: string, budgetId: string) =>
    prisma.account.create({ data: { userId, budgetId, name: 'Счёт', type: 'CASH' } });

  const seedBudgetWithMoney = async (suffix: string, income = 100_000n) => {
    const userId = user(suffix);
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id);
    const first = await seedCategory(userId, budget.id, group.id, 'Еда');
    const second = await seedCategory(userId, budget.id, group.id, 'Транспорт');
    await seedUncategorisedIncome(userId, budget.id, account.id, income);

    return { userId, budget, account, first, second };
  };

  const toCategory = (categoryId: string) => ({ kind: 'CATEGORY', categoryId });
  const readyToAssign = { kind: 'READY_TO_ASSIGN' };

  const assignmentsOf = (userId: string) =>
    prisma.assignment.findMany({ where: { userId }, orderBy: { month: 'asc' } });

  beforeAll(async () => {
    key = createTestSigningKey();
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    prisma = app.get(PrismaService);
    webOrigin = resolveWebOrigin(app.get(ConfigService));
    await removeFixtures();
  });

  afterAll(async () => {
    if (prisma) {
      await removeFixtures();
    }
    if (app) {
      await app.close();
    }
    if (originalJwtKey === undefined) {
      delete process.env.CLERK_JWT_KEY;
    } else {
      process.env.CLERK_JWT_KEY = originalJwtKey;
    }
  });

  describe('what a move does to the four numbers', () => {
    it('moves money out of the pool and into a category, by exactly the amount', async () => {
      const { userId, first } = await seedBudgetWithMoney('IntoCategory');

      const before = await viewOf(userId, '2026-02');
      expect(before.readyToAssign).toBe('100000');
      expect(categoryIn(before, first.id)).toMatchObject({ assigned: '0', available: '0' });

      await move(userId, {
        month: '2026-02',
        amount: '25000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'into-category',
      }).expect(201);

      const after = await viewOf(userId, '2026-02');
      expect(after.readyToAssign).toBe('75000');
      expect(categoryIn(after, first.id)).toMatchObject({
        assigned: '25000',
        available: '25000',
      });
    });

    it('moves money between two categories without touching the pool', async () => {
      const { userId, first, second } = await seedBudgetWithMoney('BetweenCategories');

      await move(userId, {
        month: '2026-02',
        amount: '30000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'fill-first',
      }).expect(201);

      const before = await viewOf(userId, '2026-02');

      await move(userId, {
        month: '2026-02',
        amount: '10000',
        from: toCategory(first.id),
        to: toCategory(second.id),
        idempotencyKey: 'first-to-second',
      }).expect(201);

      const after = await viewOf(userId, '2026-02');

      expect(after.readyToAssign).toBe(before.readyToAssign);
      expect(categoryIn(after, first.id)).toMatchObject({
        assigned: '20000',
        available: '20000',
      });
      expect(categoryIn(after, second.id)).toMatchObject({
        assigned: '10000',
        available: '10000',
      });
    });

    it('moves money out of a category and back into the pool', async () => {
      const { userId, first } = await seedBudgetWithMoney('BackToPool');

      await move(userId, {
        month: '2026-02',
        amount: '40000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'fill',
      }).expect(201);

      await move(userId, {
        month: '2026-02',
        amount: '15000',
        from: toCategory(first.id),
        to: readyToAssign,
        idempotencyKey: 'give-back',
      }).expect(201);

      const after = await viewOf(userId, '2026-02');
      expect(after.readyToAssign).toBe('75000');
      expect(categoryIn(after, first.id)).toMatchObject({
        assigned: '25000',
        available: '25000',
      });
    });

    it('edits the row of that month rather than adding a second one', async () => {
      const { userId, first } = await seedBudgetWithMoney('OneRow');

      for (const [index, amount] of ['10000', '5000'].entries()) {
        await move(userId, {
          month: '2026-02',
          amount,
          from: readyToAssign,
          to: toCategory(first.id),
          idempotencyKey: `twice-${index}`,
        }).expect(201);
      }

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(15_000n);
    });

    it('lowers the pool at once for a future month and leaves this month alone', async () => {
      const { userId, first } = await seedBudgetWithMoney('FutureMonth');

      await move(userId, {
        month: '2027-01',
        amount: '20000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'next-year',
      }).expect(201);

      const thisMonth = await viewOf(userId, '2026-02');
      expect(thisMonth.readyToAssign).toBe('80000');
      expect(categoryIn(thisMonth, first.id)).toMatchObject({
        assigned: '0',
        available: '0',
      });

      const future = await viewOf(userId, '2027-01');
      expect(categoryIn(future, first.id)).toMatchObject({
        assigned: '20000',
        available: '20000',
      });
    });

    it('touches only the month it names, leaving the month before it as it was', async () => {
      const { userId, first } = await seedBudgetWithMoney('OneMonthOnly');

      await move(userId, {
        month: '2026-02',
        amount: '20000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'february',
      }).expect(201);

      const january = await viewOf(userId, '2026-01');
      expect(categoryIn(january, first.id)).toMatchObject({ assigned: '0', available: '0' });
    });

    it('returns to where it started when the same move is applied with its sides swapped', async () => {
      const { userId, first, second } = await seedBudgetWithMoney('Inverse');

      await move(userId, {
        month: '2026-02',
        amount: '30000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'inverse-fill',
      }).expect(201);

      const before = await viewOf(userId, '2026-02');

      await move(userId, {
        month: '2026-02',
        amount: '12000',
        from: toCategory(first.id),
        to: toCategory(second.id),
        idempotencyKey: 'inverse-there',
      }).expect(201);

      await move(userId, {
        month: '2026-02',
        amount: '12000',
        from: toCategory(second.id),
        to: toCategory(first.id),
        idempotencyKey: 'inverse-back',
      }).expect(201);

      const after = await viewOf(userId, '2026-02');
      expect(after.readyToAssign).toBe(before.readyToAssign);
      expect(categoryIn(after, first.id)).toEqual(categoryIn(before, first.id));
      expect(categoryIn(after, second.id)).toMatchObject({ assigned: '0', available: '0' });
    });

    it('stores the month as the first of it, in UTC, whatever zone the budget counts days in', async () => {
      const userId = user('MonthColumn');
      const budget = await seedBudget(userId, { timezone: 'Pacific/Kiritimati' });
      const group = await seedGroup(userId, budget.id);
      const category = await seedCategory(userId, budget.id, group.id, 'Еда');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(category.id),
        idempotencyKey: 'month-column',
      }).expect(201);

      const [row] = await assignmentsOf(userId);
      expect(row?.month.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });
  });

  describe('the sign of what a month holds is nobody business', () => {
    it("returns last month's leftover to the pool and leaves this month assigned negative", async () => {
      const { userId, first } = await seedBudgetWithMoney('Leftover');

      await move(userId, {
        month: '2026-01',
        amount: '10000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'january',
      }).expect(201);

      await move(userId, {
        month: '2026-02',
        amount: '10000',
        from: toCategory(first.id),
        to: readyToAssign,
        idempotencyKey: 'february-give-back',
      }).expect(201);

      const february = await viewOf(userId, '2026-02');
      expect(february.readyToAssign).toBe('100000');
      expect(categoryIn(february, first.id)).toMatchObject({
        assigned: '-10000',
        available: '0',
      });
    });

    it('lets a category overspent into the red give money away regardless', async () => {
      const { userId, budget, account, first, second } =
        await seedBudgetWithMoney('NegativeAvailable');

      await prisma.transaction.create({
        data: {
          userId,
          budgetId: budget.id,
          accountId: account.id,
          categoryId: first.id,
          date: toDbDate('2026-02-10'),
          amount: -50_000n,
          type: TransactionType.EXPENSE,
        },
      });

      const before = await viewOf(userId, '2026-02');
      expect(categoryIn(before, first.id).available).toBe('-50000');

      await move(userId, {
        month: '2026-02',
        amount: '5000',
        from: toCategory(first.id),
        to: toCategory(second.id),
        idempotencyKey: 'из-минуса',
      }).expect(201);

      const after = await viewOf(userId, '2026-02');
      expect(categoryIn(after, first.id)).toMatchObject({
        assigned: '-5000',
        available: '-55000',
      });
      expect(categoryIn(after, second.id).available).toBe('5000');
    });
  });

  describe('the four refusals', () => {
    it('refuses an amount that moves nothing or moves it backwards', async () => {
      const { userId, first } = await seedBudgetWithMoney('BadAmount');

      for (const amount of ['0', '-100']) {
        await move(userId, {
          month: '2026-02',
          amount,
          from: readyToAssign,
          to: toCategory(first.id),
          idempotencyKey: `amount-${amount}`,
        }).expect(400);
      }

      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('refuses a refused amount without touching a row that month already holds', async () => {
      const { userId, first } = await seedBudgetWithMoney('BadAmountExisting');

      await move(userId, {
        month: '2026-02',
        amount: '8000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'seed-the-row',
      }).expect(201);

      await move(userId, {
        month: '2026-02',
        amount: '0',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'zero-after',
      }).expect(400);

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(8_000n);
    });

    it('refuses a move whose two sides are the same envelope', async () => {
      const { userId, first } = await seedBudgetWithMoney('SameSide');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: toCategory(first.id),
        to: toCategory(first.id),
        idempotencyKey: 'same-category',
      }).expect(400);

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: readyToAssign,
        idempotencyKey: 'same-pool',
      }).expect(400);

      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('refuses a hidden category on either side, whatever month is being moved', async () => {
      const userId = user('Hidden');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id);
      const visible = await seedCategory(userId, budget.id, group.id, 'Еда');
      const hidden = await seedCategory(userId, budget.id, group.id, 'Убрана', {
        hiddenAt: new Date('2026-03-01T00:00:00Z'),
      });

      for (const [name, body] of [
        ['as the source', { from: toCategory(hidden.id), to: toCategory(visible.id) }],
        ['as the target', { from: readyToAssign, to: toCategory(hidden.id) }],
      ] as const) {
        await move(userId, {
          month: '2026-01',
          amount: '1000',
          ...body,
          idempotencyKey: `hidden-${name}`,
        }).expect(400);
      }

      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('does not find a category held by another budget of the same caller', async () => {
      const userId = user('OtherBudget');
      const active = await seedBudget(userId);
      const shelved = await seedBudget(userId, { name: 'Старый', active: false });
      const group = await seedGroup(userId, shelved.id);
      const elsewhere = await seedCategory(userId, shelved.id, group.id, 'Чужая');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(elsewhere.id),
        idempotencyKey: 'other-budget',
      }).expect(400);

      expect(await assignmentsOf(userId)).toHaveLength(0);
      expect(active.id).not.toBe(shelved.id);
    });

    it('does not find a category that exists nowhere, rather than failing at 500', async () => {
      const { userId } = await seedBudgetWithMoney('UnknownCategory');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory('01999999-9999-7999-8999-999999999999'),
        idempotencyKey: 'unknown-category',
      }).expect(400);

      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('names the field when refusing a categoryId that is not a uuid, so the pipe is what refused', async () => {
      const { userId } = await seedBudgetWithMoney('MalformedId');

      const response = await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: { kind: 'CATEGORY', categoryId: 'not-a-uuid' },
        idempotencyKey: 'malformed-id',
      }).expect(400);

      expect(JSON.stringify(response.body)).toContain('categoryId');
    });

    it('takes a category named in upper case and echoes back the one name the row has', async () => {
      const { userId, first } = await seedBudgetWithMoney('UpperCaseId');

      const response = await move(userId, {
        month: '2026-02',
        amount: '3000',
        from: readyToAssign,
        to: { kind: 'CATEGORY', categoryId: first.id.toUpperCase() },
        idempotencyKey: 'upper-case-id',
      }).expect(201);

      expect(asRecord(response.body).to).toEqual({ kind: 'CATEGORY', categoryId: first.id });

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.categoryId).toBe(first.id);
      expect(rows[0]?.amount).toBe(3_000n);
    });

    it('answers a recased repeat of one intent with the first result, not a conflict', async () => {
      const { userId, first } = await seedBudgetWithMoney('RecasedRepeat');

      const bodyWith = (categoryId: string): Record<string, unknown> => ({
        month: '2026-02',
        amount: '3000',
        from: readyToAssign,
        to: { kind: 'CATEGORY', categoryId },
        idempotencyKey: 'one-intent-two-spellings',
      });

      const written = await move(userId, bodyWith(first.id)).expect(201);
      const replayed = await move(userId, bodyWith(first.id.toUpperCase())).expect(201);

      expect(replayed.body).toEqual(written.body);
      expect((await assignmentsOf(userId))[0]?.amount).toBe(3_000n);
    });

    it('refuses a category side carrying no id, which names no envelope at all', async () => {
      const { userId, first } = await seedBudgetWithMoney('NoId');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: { kind: 'CATEGORY' },
        to: toCategory(first.id),
        idempotencyKey: 'no-id',
      }).expect(400);
    });

    it('refuses a pool side carrying an id, which states an intent that reads two ways', async () => {
      const { userId, first } = await seedBudgetWithMoney('PoolWithId');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: { kind: 'READY_TO_ASSIGN', categoryId: first.id },
        to: toCategory(first.id),
        idempotencyKey: 'pool-with-id',
      }).expect(400);
    });

    it('never looks at what a category holds, so no move is refused for lack of money', async () => {
      const userId = user('NoMoneyAtAll');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id);
      const category = await seedCategory(userId, budget.id, group.id, 'Еда');

      await move(userId, {
        month: '2026-02',
        amount: '999999',
        from: readyToAssign,
        to: toCategory(category.id),
        idempotencyKey: 'empty-pool',
      }).expect(201);

      const view = await viewOf(userId, '2026-02');
      expect(view.readyToAssign).toBe('-999999');
    });

    it('refuses a caller with no active budget with a 400 rather than a 500', async () => {
      await move(user('NoBudget'), {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory('01999999-9999-7999-8999-999999999999'),
        idempotencyKey: 'no-budget',
      }).expect(400);
    });
  });

  describe('why a move was refused', () => {
    it('names the reason on every refusal the domain raises', async () => {
      const userId = user('Reasons');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id);
      const visible = await seedCategory(userId, budget.id, group.id, 'Еда');
      const hidden = await seedCategory(userId, budget.id, group.id, 'Убрана', {
        hiddenAt: new Date('2026-03-01T00:00:00Z'),
      });

      const cases = [
        ['CATEGORY_HIDDEN', { from: readyToAssign, to: toCategory(hidden.id) }],
        [
          'UNKNOWN_CATEGORY',
          { from: readyToAssign, to: toCategory('01999999-9999-7999-8999-999999999999') },
        ],
        ['SAME_ENVELOPE', { from: toCategory(visible.id), to: toCategory(visible.id) }],
      ] as const;

      for (const [reason, sides] of cases) {
        const answer = await move(userId, {
          month: '2026-01',
          amount: '1000',
          ...sides,
          idempotencyKey: `reason-${reason}`,
        }).expect(400);

        expect(answer.body).toMatchObject({ statusCode: 400, reason });
      }

      const noBudget = await move(user('ReasonsNoBudget'), {
        month: '2026-01',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(visible.id),
        idempotencyKey: 'reason-no-budget',
      }).expect(400);

      expect(noBudget.body).toMatchObject({ statusCode: 400, reason: 'NO_ACTIVE_BUDGET' });
      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('carries a reason a screen can branch on rather than one it has to read', async () => {
      const userId = user('ReasonVocabulary');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id);
      const hidden = await seedCategory(userId, budget.id, group.id, 'Убрана', {
        hiddenAt: new Date('2026-03-01T00:00:00Z'),
      });

      const answer = await move(userId, {
        month: '2026-01',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(hidden.id),
        idempotencyKey: 'reason-vocabulary',
      }).expect(400);

      const { reason } = answer.body as { reason?: unknown };

      expect(isMoveRefusal(reason)).toBe(true);
    });

    it('gives no reason when the body was refused, because the pipe answers before the domain', async () => {
      const userId = user('PipeNoReason');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id);
      const category = await seedCategory(userId, budget.id, group.id, 'Еда');

      for (const body of [
        { month: '2026-13', amount: '1000' },
        { month: '2026-01', amount: '0' },
        { month: '2026-01', amount: '10.50' },
      ]) {
        const answer = await move(userId, {
          ...body,
          from: readyToAssign,
          to: toCategory(category.id),
          idempotencyKey: `pipe-${body.month}-${body.amount}`,
        }).expect(400);

        expect(answer.body).not.toHaveProperty('reason');
      }
    });
  });

  describe('what the edge refuses before the domain sees it', () => {
    it('refuses a month that is not written YYYY-MM', async () => {
      const { userId, first } = await seedBudgetWithMoney('BadMonth');

      for (const month of ['2026-2', '2026-13', '2026-02-01', 'февраль', '']) {
        await move(userId, {
          month,
          amount: '1000',
          from: readyToAssign,
          to: toCategory(first.id),
          idempotencyKey: `month-${month}`,
        }).expect(400);
      }
    });

    it('refuses a field the body never declared, at the top level and inside a side', async () => {
      const { userId, first } = await seedBudgetWithMoney('Undeclared');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'undeclared-top',
        userId: 'user_2somebodyElse',
      }).expect(400);

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: { kind: 'CATEGORY', categoryId: first.id, amount: '999999' },
        idempotencyKey: 'undeclared-nested',
      }).expect(400);

      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('refuses a side that is missing, or is not an object at all', async () => {
      const { userId, first } = await seedBudgetWithMoney('BadSide');

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        to: toCategory(first.id),
        idempotencyKey: 'missing-side',
      }).expect(400);

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: 'READY_TO_ASSIGN',
        to: toCategory(first.id),
        idempotencyKey: 'string-side',
      }).expect(400);

      await move(userId, {
        month: '2026-02',
        amount: '1000',
        from: { kind: 'POOL' },
        to: toCategory(first.id),
        idempotencyKey: 'unknown-kind',
      }).expect(400);
    });

    it('refuses an idempotency key that is missing, blank or longer than the column', async () => {
      const { userId, first } = await seedBudgetWithMoney('BadKey');

      const withKey = (idempotencyKey?: string): Record<string, unknown> => ({
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(first.id),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });

      await move(userId, withKey()).expect(400);
      await move(userId, withKey('')).expect(400);
      await move(userId, withKey('   ')).expect(400);
      await move(userId, withKey('k'.repeat(65))).expect(400);
      expect(await assignmentsOf(userId)).toHaveLength(0);
    });

    it('refuses money sent as a JSON number, which is the silent precision loss case', async () => {
      const { userId, first } = await seedBudgetWithMoney('NumberAmount');

      await move(userId, {
        month: '2026-02',
        amount: 1000,
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'number-amount',
      }).expect(400);
    });

    it('refuses a request carrying no token and writes nothing', async () => {
      const { userId, first } = await seedBudgetWithMoney('NoToken');

      await request(app.getHttpServer() as Server)
        .post('/moves')
        .send({
          month: '2026-02',
          amount: '1000',
          from: readyToAssign,
          to: toCategory(first.id),
          idempotencyKey: 'no-token',
        })
        .expect(401);

      expect(await assignmentsOf(userId)).toHaveLength(0);
    });
  });

  describe('the idempotency key', () => {
    it('answers a repeat with the first result and leaves the amount where it was', async () => {
      const { userId, first } = await seedBudgetWithMoney('Repeat');

      const body = {
        month: '2026-02',
        amount: '7000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'form-opened-once',
      };

      const written = await move(userId, body).expect(201);
      const replayed = await move(userId, body).expect(201);

      expect(replayed.body).toEqual(written.body);

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(7_000n);
      expect(await prisma.idempotencyKey.count({ where: { userId } })).toBe(1);
    });

    it('applies once when two requests carrying one key run side by side', async () => {
      const { userId, first } = await seedBudgetWithMoney('SideBySide');

      const body = {
        month: '2026-02',
        amount: '3000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'double-click',
      };

      const [one, other] = await Promise.all([move(userId, body), move(userId, body)]);

      expect(one.status).toBe(201);
      expect(other.status).toBe(201);
      expect(other.body).toEqual(one.body);

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(3_000n);
    });

    it('sums two concurrent moves into one envelope rather than losing one of them', async () => {
      const { userId, first } = await seedBudgetWithMoney('Concurrent');

      const bodyWith = (idempotencyKey: string): Record<string, unknown> => ({
        month: '2026-02',
        amount: '1000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey,
      });

      const answers = await Promise.all([
        move(userId, bodyWith('concurrent-one')),
        move(userId, bodyWith('concurrent-two')),
      ]);

      for (const answer of answers) {
        expect(answer.status).toBe(201);
      }

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(2_000n);
    });

    it('takes two opposite moves over one pair of filled envelopes at once, without deadlocking', async () => {
      const { userId, first, second } = await seedBudgetWithMoney('Opposite');

      for (const [index, category] of [first, second].entries()) {
        await move(userId, {
          month: '2026-02',
          amount: '20000',
          from: readyToAssign,
          to: toCategory(category.id),
          idempotencyKey: `opposite-seed-${index}`,
        }).expect(201);
      }

      for (const round of [0, 1, 2, 3]) {
        const answers = await Promise.all([
          move(userId, {
            month: '2026-02',
            amount: '1000',
            from: toCategory(first.id),
            to: toCategory(second.id),
            idempotencyKey: `opposite-there-${round}`,
          }),
          move(userId, {
            month: '2026-02',
            amount: '1000',
            from: toCategory(second.id),
            to: toCategory(first.id),
            idempotencyKey: `opposite-back-${round}`,
          }),
        ]);

        expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
      }

      const rows = await assignmentsOf(userId);
      expect(rows.map((row) => row.amount)).toEqual([20_000n, 20_000n]);
    });

    it("refuses a second intent sent under the first one's key", async () => {
      const { userId, first, second } = await seedBudgetWithMoney('OtherIntent');

      await move(userId, {
        month: '2026-02',
        amount: '5000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'one-intent',
      }).expect(201);

      await move(userId, {
        month: '2026-02',
        amount: '5000',
        from: readyToAssign,
        to: toCategory(second.id),
        idempotencyKey: 'one-intent',
      }).expect(409);

      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.categoryId).toBe(first.id);
    });

    it('refuses a repeated key aimed at a budget the caller has since left', async () => {
      const { userId, first } = await seedBudgetWithMoney('SwitchedBudget');

      const body = {
        month: '2026-02',
        amount: '2000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'before-the-switch',
      };

      await move(userId, body).expect(201);

      await prisma.budget.updateMany({ where: { userId }, data: { active: false } });
      await seedBudget(userId, { name: 'Второй' });

      await move(userId, body).expect(409);
    });
  });

  describe('what the endpoint answers with', () => {
    it('echoes the move and nothing derived from it', async () => {
      const { userId, first } = await seedBudgetWithMoney('Echo');

      const response = await move(userId, {
        month: '2026-02',
        amount: '9000',
        from: readyToAssign,
        to: toCategory(first.id),
        idempotencyKey: 'echo',
      }).expect(201);

      expect(asRecord(response.body)).toEqual({
        month: '2026-02',
        amount: '9000',
        from: { kind: 'READY_TO_ASSIGN' },
        to: { kind: 'CATEGORY', categoryId: first.id },
      });
    });
  });
});
