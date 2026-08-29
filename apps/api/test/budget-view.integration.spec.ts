import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionType, type AccountType } from '@rondo/db';
import { toDbDate, toDbMonth } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoBudgetView';

const user = (name: string): string => `${USER_PREFIX}${name}`;

interface ViewCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  assigned: string;
  activity: string;
  available: string;
  availableAllTime: string;
  hidden: boolean;
}

interface ViewGroup {
  id: string;
  name: string;
  hidden: boolean;
  categories: ViewCategory[];
}

interface View {
  month: string;
  readyToAssign: string;
  groups: ViewGroup[];
}

const asView = (body: unknown): View => {
  const view = body as View;
  if (typeof view?.readyToAssign !== 'string' || !Array.isArray(view.groups)) {
    throw new Error(`Not a budget view: ${JSON.stringify(body)}`);
  }

  return view;
};

const categoriesOf = (view: View): ViewCategory[] =>
  view.groups.flatMap((group) => group.categories);

const named = (view: View, name: string): ViewCategory => {
  const found = categoriesOf(view).find((category) => category.name === name);
  if (!found) {
    throw new Error(`No category ${name} in ${JSON.stringify(view)}`);
  }

  return found;
};

describe('/budget-view (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const read = (userId: string, month?: string) =>
    request(app.getHttpServer() as Server)
      .get(month === undefined ? '/budget-view' : `/budget-view?month=${month}`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

  const viewOf = async (userId: string, month: string): Promise<View> => {
    const response = await read(userId, month).expect(200);

    return asView(response.body);
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

  const seedGroup = (
    userId: string,
    budgetId: string,
    name: string,
    sortOrder = 0,
    hiddenAt: Date | null = null,
  ) =>
    prisma.categoryGroup.create({
      data: { userId, budgetId, name, sortOrder, hiddenAt },
    });

  const seedCategory = (
    userId: string,
    budgetId: string,
    groupId: string,
    name: string,
    sortOrder = 0,
    hiddenAt: Date | null = null,
  ) =>
    prisma.category.create({
      data: { userId, budgetId, groupId, name, sortOrder, hiddenAt },
    });

  const seedAccount = (
    userId: string,
    budgetId: string,
    name = 'Кошелёк',
    type: AccountType = 'CASH',
  ) => prisma.account.create({ data: { userId, budgetId, name, type } });

  const seedTransaction = (
    userId: string,
    budgetId: string,
    accountId: string,
    over: {
      date: string;
      amount: bigint;
      type?: TransactionType;
      categoryId?: string | null;
      isSystem?: boolean;
      transferId?: string | null;
    },
  ) =>
    prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId,
        date: toDbDate(over.date),
        amount: over.amount,
        type: over.type ?? TransactionType.EXPENSE,
        categoryId: over.categoryId ?? null,
        isSystem: over.isSystem ?? false,
        transferId: over.transferId ?? null,
      },
    });

  const seedAssignment = (
    userId: string,
    budgetId: string,
    categoryId: string,
    month: string,
    amount: bigint,
  ) =>
    prisma.assignment.create({
      data: { userId, budgetId, categoryId, month: toDbMonth(month), amount },
    });

  beforeAll(async () => {
    key = createTestSigningKey();
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

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

  it('computes the month from transactions and assignments, storing none of it', async () => {
    const userId = user('Main');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const category = await seedCategory(userId, budget.id, group.id, 'Аренда');

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-05',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, category.id, '2026-02', 70_000n);
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-10',
      amount: -25_000n,
      categoryId: category.id,
    });

    const view = await viewOf(userId, '2026-02');

    expect(view.month).toBe('2026-02');
    expect(view.readyToAssign).toBe('30000');
    expect(view.groups).toHaveLength(1);
    expect(named(view, 'Аренда')).toMatchObject({
      assigned: '70000',
      activity: '-25000',
      available: '45000',
    });
  });

  it('holds only this month in assigned, so a leftover shows as available being larger', async () => {
    const userId = user('Carry');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const category = await seedCategory(userId, budget.id, group.id, 'Аренда');

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-05',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, category.id, '2026-01', 70_000n);
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-20',
      amount: -20_000n,
      categoryId: category.id,
    });

    const february = await viewOf(userId, '2026-02');

    expect(named(february, 'Аренда')).toMatchObject({
      assigned: '0',
      activity: '0',
      available: '50000',
    });
    expect(february.readyToAssign).toBe('30000');
  });

  it('counts activity in its own month while available keeps everything before it', async () => {
    const userId = user('Accumulate');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const category = await seedCategory(userId, budget.id, group.id, 'Еда');

    await seedAssignment(userId, budget.id, category.id, '2026-01', 70_000n);
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-20',
      amount: -20_000n,
      categoryId: category.id,
    });
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-14',
      amount: -5_000n,
      categoryId: category.id,
    });

    const february = await viewOf(userId, '2026-02');

    expect(named(february, 'Еда')).toMatchObject({ activity: '-5000', available: '45000' });
  });

  it('lets a future assignment lower the pool at once while no current month shows it', async () => {
    const userId = user('Future');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Планы');
    const category = await seedCategory(userId, budget.id, group.id, 'Отпуск');

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-01',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, category.id, '2026-05', 40_000n);

    const february = await viewOf(userId, '2026-02');
    const may = await viewOf(userId, '2026-05');

    expect(february.readyToAssign).toBe('60000');
    expect(named(february, 'Отпуск')).toMatchObject({ assigned: '0', available: '0' });
    expect(may.readyToAssign).toBe('60000');
    expect(named(may, 'Отпуск')).toMatchObject({ assigned: '40000', available: '40000' });
  });

  it('answers a negative assignment and a negative available as they are, refusing nothing', async () => {
    const userId = user('Negative');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const gave = await seedCategory(userId, budget.id, group.id, 'Вернула', 0);
    const spent = await seedCategory(userId, budget.id, group.id, 'Перерасход', 1);

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-01',
      amount: 50_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, gave.id, '2026-02', -10_000n);
    await seedAssignment(userId, budget.id, spent.id, '2026-02', 5_000n);
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-11',
      amount: -9_000n,
      categoryId: spent.id,
    });

    const view = await viewOf(userId, '2026-02');

    expect(view.readyToAssign).toBe('55000');
    expect(named(view, 'Вернула')).toMatchObject({ assigned: '-10000', available: '-10000' });
    expect(named(view, 'Перерасход')).toMatchObject({ assigned: '5000', available: '-4000' });
  });

  it('takes every uncategorised transaction into the pool, system and adjustment included', async () => {
    const userId = user('Sources');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const category = await seedCategory(userId, budget.id, group.id, 'Аренда');

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-01',
      amount: 200_000n,
      type: TransactionType.INCOME,
      isSystem: true,
    });
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-03',
      amount: 50_000n,
      type: TransactionType.INCOME,
    });
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-04',
      amount: -30_000n,
      type: TransactionType.ADJUSTMENT,
    });
    await seedAssignment(userId, budget.id, category.id, '2026-02', 20_000n);

    const view = await viewOf(userId, '2026-02');

    expect(view.readyToAssign).toBe('200000');
  });

  it('lists a category with no assignment, one with no transaction, and one with neither', async () => {
    const userId = user('Zero');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const assignedOnly = await seedCategory(userId, budget.id, group.id, 'Только назначение', 0);
    const spentOnly = await seedCategory(userId, budget.id, group.id, 'Только расход', 1);
    await seedCategory(userId, budget.id, group.id, 'Совсем новая', 2);

    await seedAssignment(userId, budget.id, assignedOnly.id, '2026-02', 1_000n);
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-07',
      amount: -700n,
      categoryId: spentOnly.id,
    });

    const view = await viewOf(userId, '2026-02');

    expect(categoriesOf(view)).toHaveLength(3);
    expect(named(view, 'Только назначение')).toMatchObject({
      assigned: '1000',
      activity: '0',
      available: '1000',
    });
    expect(named(view, 'Только расход')).toMatchObject({
      assigned: '0',
      activity: '-700',
      available: '-700',
    });
    expect(named(view, 'Совсем новая')).toMatchObject({
      assigned: '0',
      activity: '0',
      available: '0',
    });
  });

  it('buckets a transaction by the calendar date it carries, on either side of the boundary', async () => {
    const userId = user('Boundary');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const category = await seedCategory(userId, budget.id, group.id, 'Еда');

    for (const [date, amount] of [
      ['2026-01-31', -100n],
      ['2026-02-01', -200n],
      ['2026-02-28', -300n],
      ['2026-03-01', -400n],
    ] as const) {
      await seedTransaction(userId, budget.id, account.id, {
        date,
        amount,
        categoryId: category.id,
      });
    }

    const january = await viewOf(userId, '2026-01');
    const february = await viewOf(userId, '2026-02');

    expect(named(january, 'Еда')).toMatchObject({ activity: '-100', available: '-100' });
    expect(named(february, 'Еда')).toMatchObject({ activity: '-500', available: '-600' });
  });

  it('drops a category from the month it was hidden in and keeps its money in the pool', async () => {
    const userId = user('HiddenCategory');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const visible = await seedCategory(userId, budget.id, group.id, 'Осталась', 0);
    const hidden = await seedCategory(
      userId,
      budget.id,
      group.id,
      'Убрали',
      1,
      new Date('2026-02-10T12:00:00Z'),
    );

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-02',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, visible.id, '2026-01', 5_000n);
    await seedAssignment(userId, budget.id, hidden.id, '2026-01', 30_000n);
    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-20',
      amount: -10_000n,
      categoryId: hidden.id,
    });

    const january = await viewOf(userId, '2026-01');
    const february = await viewOf(userId, '2026-02');
    const march = await viewOf(userId, '2026-03');

    expect(categoriesOf(january).map((category) => category.name)).toEqual(['Осталась', 'Убрали']);
    expect(categoriesOf(february).map((category) => category.name)).toEqual(['Осталась']);
    expect(categoriesOf(march).map((category) => category.name)).toEqual(['Осталась']);

    for (const view of [january, february, march]) {
      expect(view.readyToAssign).toBe('65000');
    }
  });

  it('reads the hiding boundary in the budget timezone, not in whatever UTC would say', async () => {
    const userId = user('HiddenAtMidnight');
    const budget = await seedBudget(userId);
    const group = await seedGroup(userId, budget.id, 'Дом');
    await seedCategory(
      userId,
      budget.id,
      group.id,
      'Скрыли в марте',
      0,
      new Date('2026-02-28T23:30:00Z'),
    );

    const february = await viewOf(userId, '2026-02');
    const march = await viewOf(userId, '2026-03');

    expect(categoriesOf(february).map((category) => category.name)).toEqual(['Скрыли в марте']);
    expect(categoriesOf(march)).toEqual([]);
  });

  it('takes a hidden group out with its categories, and leaves the pool where it was', async () => {
    const userId = user('HiddenGroup');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);
    const staying = await seedGroup(userId, budget.id, 'Осталась', 0);
    const leaving = await seedGroup(
      userId,
      budget.id,
      'Убрали',
      1,
      new Date('2026-02-10T12:00:00Z'),
    );
    const kept = await seedCategory(userId, budget.id, staying.id, 'Аренда');
    const first = await seedCategory(userId, budget.id, leaving.id, 'Первая', 0);
    const second = await seedCategory(userId, budget.id, leaving.id, 'Вторая', 1);

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-01-02',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, kept.id, '2026-01', 5_000n);
    await seedAssignment(userId, budget.id, first.id, '2026-01', 10_000n);
    await seedAssignment(userId, budget.id, second.id, '2026-01', 10_000n);

    const january = await viewOf(userId, '2026-01');
    const february = await viewOf(userId, '2026-02');
    const march = await viewOf(userId, '2026-03');

    expect(january.groups.map((group) => group.name)).toEqual(['Осталась', 'Убрали']);
    expect(categoriesOf(january)).toHaveLength(3);
    expect(february.groups.map((group) => group.name)).toEqual(['Осталась']);
    expect(categoriesOf(february).map((category) => category.name)).toEqual(['Аренда']);
    expect(categoriesOf(march).map((category) => category.name)).toEqual(['Аренда']);

    for (const view of [january, february, march]) {
      expect(view.readyToAssign).toBe('75000');
    }
  });

  it('answers a budget that has no categories with the pool and an empty list', async () => {
    const userId = user('Empty');
    const budget = await seedBudget(userId);
    const account = await seedAccount(userId, budget.id);

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-01',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });

    const view = await viewOf(userId, '2026-02');

    expect(view.readyToAssign).toBe('100000');
    expect(view.groups).toEqual([]);
  });

  it('keeps a group whose categories are all hidden, as an empty group', async () => {
    const userId = user('EmptyGroup');
    const budget = await seedBudget(userId);
    const never = await seedGroup(userId, budget.id, 'Ничего не было', 0);
    const emptied = await seedGroup(userId, budget.id, 'Всё скрыли', 1);

    await seedCategory(
      userId,
      budget.id,
      emptied.id,
      'Скрытая',
      0,
      new Date('2026-01-05T12:00:00Z'),
    );

    const view = await viewOf(userId, '2026-02');

    expect(view.groups.map((group) => group.name)).toEqual(['Ничего не было', 'Всё скрыли']);
    expect(view.groups.map((group) => group.categories)).toEqual([[], []]);
    expect(view.groups.map((group) => group.id)).toEqual([never.id, emptied.id]);
  });

  it('orders groups and the categories inside them by their sort order', async () => {
    const userId = user('Order');
    const budget = await seedBudget(userId);
    const first = await seedGroup(userId, budget.id, 'Нулевой', 0);
    await seedGroup(userId, budget.id, 'Второй', 2);
    await seedGroup(userId, budget.id, 'Первый', 1);
    await seedCategory(userId, budget.id, first.id, 'Б', 1);
    await seedCategory(userId, budget.id, first.id, 'А', 0);

    const view = await viewOf(userId, '2026-02');

    expect(view.groups.map((group) => group.name)).toEqual(['Нулевой', 'Первый', 'Второй']);
    expect(view.groups[0]?.categories.map((category) => category.name)).toEqual(['А', 'Б']);
  });

  it('speaks minor units whatever the currency scales to, so a JPY budget is not divided', async () => {
    const userId = user('Yen');
    const budget = await seedBudget(userId, { currency: 'JPY', minorDigits: 0 });
    const account = await seedAccount(userId, budget.id);
    const group = await seedGroup(userId, budget.id, '家');
    const category = await seedCategory(userId, budget.id, group.id, '家賃');

    await seedTransaction(userId, budget.id, account.id, {
      date: '2026-02-01',
      amount: 5_000n,
      type: TransactionType.INCOME,
    });
    await seedAssignment(userId, budget.id, category.id, '2026-02', 2_000n);

    const view = await viewOf(userId, '2026-02');

    expect(view.readyToAssign).toBe('3000');
    expect(named(view, '家賃').assigned).toBe('2000');
  });

  it('answers what a category holds over every month beside what it holds in this one', async () => {
    const userId = user('AllTime');
    const budget = await seedBudget(userId);
    const group = await seedGroup(userId, budget.id, 'Дом');
    const later = await seedCategory(userId, budget.id, group.id, 'Отпуск', 0);
    const settled = await seedCategory(userId, budget.id, group.id, 'Аренда', 1);

    await seedAssignment(userId, budget.id, later.id, '2026-09', 40_000n);
    await seedAssignment(userId, budget.id, settled.id, '2026-02', 7_000n);

    const view = await viewOf(userId, '2026-02');

    expect(named(view, 'Отпуск')).toMatchObject({ available: '0', availableAllTime: '40000' });
    expect(named(view, 'Аренда')).toMatchObject({ available: '7000', availableAllTime: '7000' });
  });

  it('speaks minor units in that all-month sum too, so a JPY budget is not divided', async () => {
    const userId = user('YenAllTime');
    const budget = await seedBudget(userId, { currency: 'JPY', minorDigits: 0 });
    const group = await seedGroup(userId, budget.id, '家');
    const category = await seedCategory(userId, budget.id, group.id, '旅行');

    await seedAssignment(userId, budget.id, category.id, '2026-09', 5_000n);

    expect(named(await viewOf(userId, '2026-02'), '旅行').availableAllTime).toBe('5000');
  });

  it('says whether a row is hidden in the month that was asked about, not whether it ever was', async () => {
    const userId = user('HiddenFlag');
    const budget = await seedBudget(userId);
    const group = await seedGroup(userId, budget.id, 'Дом');
    await seedCategory(userId, budget.id, group.id, 'Такси', 0, new Date('2026-02-10T12:00:00Z'));

    const january = await read(userId, '2026-01&includeHidden=true').expect(200);
    const february = await read(userId, '2026-02&includeHidden=true').expect(200);

    expect(asView(january.body).groups[0]?.categories[0]).toMatchObject({ hidden: false });
    expect(asView(february.body).groups[0]?.categories[0]).toMatchObject({ hidden: true });
  });

  it('reports a hidden group as hidden while a category inside it is not hidden itself', async () => {
    const userId = user('HiddenGroupFlag');
    const budget = await seedBudget(userId);
    const group = await seedGroup(
      userId,
      budget.id,
      'Стройка',
      0,
      new Date('2026-01-05T12:00:00Z'),
    );
    await seedCategory(userId, budget.id, group.id, 'Материалы');

    const view = asView((await read(userId, '2026-02&includeHidden=true').expect(200)).body);

    expect(view.groups[0]).toMatchObject({ hidden: true });
    expect(view.groups[0]?.categories[0]).toMatchObject({ hidden: false });
  });

  it('puts both legs of a transfer in the pool, where they cancel, and in no category', async () => {
    const userId = user('Transfer');
    const budget = await seedBudget(userId);
    const from = await seedAccount(userId, budget.id, 'Кошелёк');
    const to = await seedAccount(userId, budget.id, 'Карта', 'DEBIT');
    const group = await seedGroup(userId, budget.id, 'Дом');
    await seedCategory(userId, budget.id, group.id, 'Аренда');
    const transferId = '0199c1a8-9ecf-71c7-a617-c575df073700';

    await seedTransaction(userId, budget.id, from.id, {
      date: '2026-02-01',
      amount: 100_000n,
      type: TransactionType.INCOME,
    });
    await seedTransaction(userId, budget.id, from.id, {
      date: '2026-02-05',
      amount: -30_000n,
      type: TransactionType.TRANSFER,
      transferId,
    });
    await seedTransaction(userId, budget.id, to.id, {
      date: '2026-02-05',
      amount: 30_000n,
      type: TransactionType.TRANSFER,
      transferId,
    });

    const view = await viewOf(userId, '2026-02');

    expect(view.readyToAssign).toBe('100000');
    expect(named(view, 'Аренда')).toMatchObject({ activity: '0', available: '0' });
  });

  it('costs one query however many groups and categories the budget holds', async () => {
    const userId = user('OneQuery');
    const budget = await seedBudget(userId);

    for (const index of [0, 1]) {
      const group = await seedGroup(userId, budget.id, `Группа ${index}`, index);
      for (const inner of [0, 1, 2]) {
        await seedCategory(userId, budget.id, group.id, `Категория ${index}.${inner}`, inner);
      }
    }

    const counted = jest.spyOn(ScopedRawRepository.prototype, 'query');

    try {
      const view = await viewOf(userId, '2026-02');

      expect(categoriesOf(view)).toHaveLength(6);
      expect(counted).toHaveBeenCalledTimes(1);
    } finally {
      counted.mockRestore();
    }
  });

  it('refuses a caller who has no active budget, rather than showing an empty screen', async () => {
    const response = await read(user('NoBudget'), '2026-02');

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toMatch(/budget/i);
  });

  it('refuses a month the calendar has not got, and a request that names none', async () => {
    const userId = user('BadMonth');
    await seedBudget(userId);

    await read(userId, '2026-13').expect(400);
    await read(userId, '9999-12').expect(400);
    await read(userId).expect(400);
  });

  it('refuses a caller with no token at all', async () => {
    await request(app.getHttpServer() as Server)
      .get('/budget-view?month=2026-02')
      .expect(401);
  });

  describe('the look a category is drawn with', () => {
    it('answers with the icon and the colour the row holds, and with none where none was chosen', async () => {
      const userId = user('Look');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id, 'Дом');
      await seedCategory(userId, budget.id, group.id, 'Жильё', 0);
      await prisma.category.create({
        data: {
          userId,
          budgetId: budget.id,
          groupId: group.id,
          name: 'Продукты',
          sortOrder: 1,
          icon: 'shopping-cart',
          color: 'green',
        },
      });

      const view = await viewOf(userId, '2026-02');

      expect(named(view, 'Продукты')).toMatchObject({ icon: 'shopping-cart', color: 'green' });
      expect(named(view, 'Жильё')).toMatchObject({ icon: null, color: null });
    });

    it('answers with no look for a stored name this app cannot draw', async () => {
      const userId = user('LookUnknown');
      const budget = await seedBudget(userId);
      const group = await seedGroup(userId, budget.id, 'Дом');
      await prisma.category.create({
        data: {
          userId,
          budgetId: budget.id,
          groupId: group.id,
          name: 'Ракета',
          sortOrder: 0,
          icon: 'rocket',
          color: '#ff0000',
        },
      });

      const view = await viewOf(userId, '2026-02');

      expect(named(view, 'Ракета')).toMatchObject({ icon: null, color: null });
    });
  });
});
