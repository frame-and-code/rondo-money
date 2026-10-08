import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseCalendarDate, toDbDate, todayIn } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { generateOpenApiDocument } from '@/openapi/generate';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoWorthRead';

const USER_WHOLE = `${USER_PREFIX}Whole`;
const USER_ARCHIVED = `${USER_PREFIX}Archived`;
const USER_QUIET = `${USER_PREFIX}Quiet`;
const USER_ONLY = `${USER_PREFIX}Only`;
const USER_EMPTY = `${USER_PREFIX}Empty`;
const USER_LARGE = `${USER_PREFIX}Large`;
const USER_ORDER = `${USER_PREFIX}Order`;
const USER_COUNTED = `${USER_PREFIX}Counted`;
const USER_AGREES = `${USER_PREFIX}Agrees`;
const USER_SHAPE = `${USER_PREFIX}Shape`;
const USER_NOBUDGET = `${USER_PREFIX}NoBudget`;

const ZONE = 'Europe/Warsaw';

const BEYOND_A_DOUBLE = 9_007_199_254_740_993n;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const listOf = (body: Record<string, unknown>, field: string): Record<string, unknown>[] =>
  (body[field] as unknown[]).map(asRecord);

describe('GET /net-worth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const read = (userId: string) =>
    request(app.getHttpServer() as Server)
      .get('/net-worth')
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

  const worthOf = async (userId: string): Promise<Record<string, unknown>> => {
    const response = await read(userId);
    expect(response.status).toBe(200);

    return asRecord(response.body);
  };

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.asset.deleteMany({ where: owned });
    await prisma.liability.deleteMany({ where: owned });
    await prisma.transaction.deleteMany({ where: owned });
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
        timezone: ZONE,
        active: true,
        ...over,
      },
    });

  const seedAccount = (
    userId: string,
    budgetId: string,
    name: string,
    over: Record<string, unknown> = {},
  ) => prisma.account.create({ data: { userId, budgetId, name, type: 'CASH', ...over } });

  const seedMoney = (userId: string, budgetId: string, accountId: string, amount: bigint) =>
    prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId,
        date: toDbDate(todayIn(ZONE)),
        amount,
        type: amount < 0n ? 'EXPENSE' : 'INCOME',
      },
    });

  const seedAsset = (
    userId: string,
    budgetId: string,
    name: string,
    amount: bigint,
    over: Record<string, unknown> = {},
  ) => prisma.asset.create({ data: { userId, budgetId, name, amount, ...over } });

  const seedLiability = (
    userId: string,
    budgetId: string,
    name: string,
    amount: bigint,
    over: Record<string, unknown> = {},
  ) => prisma.liability.create({ data: { userId, budgetId, name, amount, ...over } });

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

  beforeEach(async () => {
    await removeFixtures();
  });

  it('adds what the accounts hold to what is owned and takes away what is owed', async () => {
    const budget = await seedBudget(USER_WHOLE);
    const wallet = await seedAccount(USER_WHOLE, budget.id, 'Кошелёк');
    const card = await seedAccount(USER_WHOLE, budget.id, 'Карта', { type: 'DEBIT' });
    await seedMoney(USER_WHOLE, budget.id, wallet.id, 125_050n);
    await seedMoney(USER_WHOLE, budget.id, wallet.id, -25_050n);
    await seedMoney(USER_WHOLE, budget.id, card.id, 40_000n);
    await seedAsset(USER_WHOLE, budget.id, 'Квартира', 45_000_000n);
    await seedAsset(USER_WHOLE, budget.id, 'Машина', 4_800_000n);
    await seedLiability(USER_WHOLE, budget.id, 'Ипотека', 41_000_000n);

    const worth = await worthOf(USER_WHOLE);

    expect(worth).toMatchObject({
      accountsTotal: '140000',
      assetsTotal: '49800000',
      liabilitiesTotal: '41000000',
      total: '8940000',
    });
    expect(listOf(worth, 'accounts')).toMatchObject([
      { id: wallet.id, name: 'Кошелёк', type: 'CASH', balance: '100000' },
      { id: card.id, name: 'Карта', type: 'DEBIT', balance: '40000' },
    ]);
    expect(listOf(worth, 'assets').map((asset) => asset['amount'])).toEqual([
      '45000000',
      '4800000',
    ]);
    expect(listOf(worth, 'liabilities').map((owed) => owed['name'])).toEqual(['Ипотека']);
  });

  it('leaves an archived account out of the list and out of the sum, whatever it once held', async () => {
    const budget = await seedBudget(USER_ARCHIVED);
    const open = await seedAccount(USER_ARCHIVED, budget.id, 'Кошелёк');
    const closed = await seedAccount(USER_ARCHIVED, budget.id, 'Старая карта', {
      archivedAt: new Date(),
    });
    await seedMoney(USER_ARCHIVED, budget.id, open.id, 10_000n);
    await seedMoney(USER_ARCHIVED, budget.id, closed.id, 77_700n);

    const worth = await worthOf(USER_ARCHIVED);

    expect(listOf(worth, 'accounts').map((account) => account['name'])).toEqual(['Кошелёк']);
    expect(worth).toMatchObject({ accountsTotal: '10000', total: '10000' });
  });

  it('keeps an account holding no record at a balance of nothing, and counts one spent past zero', async () => {
    const budget = await seedBudget(USER_QUIET);
    await seedAccount(USER_QUIET, budget.id, 'Пустой');
    const spent = await seedAccount(USER_QUIET, budget.id, 'В минусе');
    await seedMoney(USER_QUIET, budget.id, spent.id, -4_000n);
    await seedAsset(USER_QUIET, budget.id, 'Машина', 1_000n);

    const worth = await worthOf(USER_QUIET);

    expect(listOf(worth, 'accounts')).toMatchObject([
      { name: 'Пустой', balance: '0' },
      { name: 'В минусе', balance: '-4000' },
    ]);
    expect(worth).toMatchObject({ accountsTotal: '-4000', total: '-3000' });
  });

  it('answers a budget holding only accounts', async () => {
    const budget = await seedBudget(USER_ONLY);
    const wallet = await seedAccount(USER_ONLY, budget.id, 'Кошелёк');
    await seedMoney(USER_ONLY, budget.id, wallet.id, 5_000n);

    const worth = await worthOf(USER_ONLY);

    expect(worth).toMatchObject({
      total: '5000',
      accountsTotal: '5000',
      assetsTotal: '0',
      liabilitiesTotal: '0',
      assets: [],
      liabilities: [],
    });
  });

  it('answers a budget whose every account is archived and which holds only an asset', async () => {
    const budget = await seedBudget(USER_ONLY);
    const closed = await seedAccount(USER_ONLY, budget.id, 'Старая', { archivedAt: new Date() });
    await seedMoney(USER_ONLY, budget.id, closed.id, 9_000n);
    await seedAsset(USER_ONLY, budget.id, 'Машина', 4_800_000n);

    const worth = await worthOf(USER_ONLY);

    expect(worth).toMatchObject({ total: '4800000', accountsTotal: '0', accounts: [] });
    expect(listOf(worth, 'assets')).toHaveLength(1);
  });

  it('answers a budget holding only what is owed with a total below zero', async () => {
    const budget = await seedBudget(USER_ONLY);
    await seedLiability(USER_ONLY, budget.id, 'Долг', 250_000n);

    const worth = await worthOf(USER_ONLY);

    expect(worth).toMatchObject({
      total: '-250000',
      accountsTotal: '0',
      assetsTotal: '0',
      liabilitiesTotal: '250000',
      accounts: [],
      assets: [],
    });
  });

  it('answers a budget holding nothing at all with nothing, rather than failing', async () => {
    await seedBudget(USER_EMPTY);

    await expect(worthOf(USER_EMPTY)).resolves.toEqual({
      total: '0',
      accountsTotal: '0',
      assetsTotal: '0',
      liabilitiesTotal: '0',
      accounts: [],
      assets: [],
      liabilities: [],
    });
  });

  it('answers with amounts as strings, exact past what a double can hold', async () => {
    const budget = await seedBudget(USER_LARGE);
    const wallet = await seedAccount(USER_LARGE, budget.id, 'Кошелёк');
    await seedMoney(USER_LARGE, budget.id, wallet.id, 7n);
    await seedAsset(USER_LARGE, budget.id, 'Завод', BEYOND_A_DOUBLE);

    const worth = await worthOf(USER_LARGE);

    expect(worth['assetsTotal']).toBe('9007199254740993');
    expect(worth['total']).toBe('9007199254741000');
    expect(listOf(worth, 'assets')[0]?.['amount']).toBe('9007199254740993');
  });

  it('lists each side oldest first, with the day as a date or as nothing', async () => {
    const budget = await seedBudget(USER_ORDER);
    await seedAccount(USER_ORDER, budget.id, 'Яблоко', {
      createdAt: new Date('2026-01-02T10:00:00Z'),
    });
    await seedAccount(USER_ORDER, budget.id, 'Абрикос', {
      createdAt: new Date('2026-01-03T10:00:00Z'),
    });
    await seedAsset(USER_ORDER, budget.id, 'Позже', 2n, {
      createdAt: new Date('2026-02-02T10:00:00Z'),
    });
    await seedAsset(USER_ORDER, budget.id, 'Раньше', 1n, {
      createdAt: new Date('2026-02-01T10:00:00Z'),
      date: toDbDate(parseCalendarDate('2024-03-15')),
    });
    await seedLiability(USER_ORDER, budget.id, 'Второй', 2n, {
      createdAt: new Date('2026-03-02T10:00:00Z'),
    });
    await seedLiability(USER_ORDER, budget.id, 'Первый', 1n, {
      createdAt: new Date('2026-03-01T10:00:00Z'),
    });

    const worth = await worthOf(USER_ORDER);

    expect(listOf(worth, 'accounts').map((account) => account['name'])).toEqual([
      'Яблоко',
      'Абрикос',
    ]);
    expect(listOf(worth, 'assets').map(({ name, date }) => ({ name, date }))).toEqual([
      { name: 'Раньше', date: '2024-03-15' },
      { name: 'Позже', date: null },
    ]);
    expect(listOf(worth, 'liabilities').map((owed) => owed['name'])).toEqual(['Первый', 'Второй']);
  });

  it('costs one raw statement whether the budget holds one row of each kind or three', async () => {
    const budget = await seedBudget(USER_COUNTED);
    const wallet = await seedAccount(USER_COUNTED, budget.id, 'Один');
    await seedMoney(USER_COUNTED, budget.id, wallet.id, 10_000n);
    await seedAsset(USER_COUNTED, budget.id, 'Один', 1n);
    await seedLiability(USER_COUNTED, budget.id, 'Один', 1n);

    const counted = jest.spyOn(ScopedRawRepository.prototype, 'query');

    try {
      await worthOf(USER_COUNTED);
      const forOne = counted.mock.calls.length;

      for (const name of ['Два', 'Три']) {
        await seedAccount(USER_COUNTED, budget.id, name);
        await seedAsset(USER_COUNTED, budget.id, name, 1n);
        await seedLiability(USER_COUNTED, budget.id, name, 1n);
      }

      counted.mockClear();
      const worth = await worthOf(USER_COUNTED);

      expect(listOf(worth, 'accounts')).toHaveLength(3);
      expect(listOf(worth, 'assets')).toHaveLength(3);
      expect(listOf(worth, 'liabilities')).toHaveLength(3);
      expect(forOne).toBe(1);
      expect(counted).toHaveBeenCalledTimes(forOne);
    } finally {
      counted.mockRestore();
    }
  });

  it('agrees with the accounts screen about what the accounts hold together', async () => {
    const budget = await seedBudget(USER_AGREES);
    const wallet = await seedAccount(USER_AGREES, budget.id, 'Кошелёк');
    const spent = await seedAccount(USER_AGREES, budget.id, 'В минусе');
    const closed = await seedAccount(USER_AGREES, budget.id, 'Старая', { archivedAt: new Date() });
    await seedMoney(USER_AGREES, budget.id, wallet.id, 31_337n);
    await seedMoney(USER_AGREES, budget.id, spent.id, -1_200n);
    await seedMoney(USER_AGREES, budget.id, closed.id, 50_000n);

    const accounts = await request(app.getHttpServer() as Server)
      .get('/accounts')
      .set('Authorization', `Bearer ${tokenFor(USER_AGREES)}`);
    const worth = await worthOf(USER_AGREES);

    expect(accounts.status).toBe(200);
    expect(worth['accountsTotal']).toBe('30137');
    expect(worth['accountsTotal']).toBe(asRecord(accounts.body)['total']);
  });

  it('answers with the shape the contract publishes', async () => {
    const budget = await seedBudget(USER_SHAPE);
    const wallet = await seedAccount(USER_SHAPE, budget.id, 'Кошелёк');
    await seedMoney(USER_SHAPE, budget.id, wallet.id, 1_000n);
    await seedAsset(USER_SHAPE, budget.id, 'Машина', 1n);
    await seedLiability(USER_SHAPE, budget.id, 'Долг', 1n);

    const document = await generateOpenApiDocument();
    const publishedFields = (name: string): string[] => {
      const schema = document.components?.schemas?.[name];

      return schema && 'properties' in schema ? Object.keys(schema.properties ?? {}).sort() : [];
    };

    const worth = await worthOf(USER_SHAPE);

    expect(Object.keys(worth).sort()).toEqual(publishedFields('NetWorthResponse'));
    expect(Object.keys(listOf(worth, 'accounts')[0] ?? {}).sort()).toEqual(
      publishedFields('NetWorthAccountResponse'),
    );
    expect(publishedFields('NetWorthAccountResponse')).toEqual(['balance', 'id', 'name', 'type']);
    expect(Object.keys(listOf(worth, 'assets')[0] ?? {}).sort()).toEqual(
      publishedFields('NetWorthItemResponse'),
    );
    expect(Object.keys(listOf(worth, 'liabilities')[0] ?? {}).sort()).toEqual(
      publishedFields('NetWorthItemResponse'),
    );
  });

  it('refuses with a reason when the caller has no active budget, rather than failing at 500', async () => {
    const response = await read(USER_NOBUDGET);

    expect(response.status).toBe(400);
    expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
  });
});
