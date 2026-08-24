import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { calendarDateOf, todayIn } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { generateOpenApiDocument } from '@/openapi/generate';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoAccounts';

const USER_FIRST = `${USER_PREFIX}First`;
const USER_EMPTY = `${USER_PREFIX}Empty`;
const USER_EAST = `${USER_PREFIX}East`;
const USER_WEST = `${USER_PREFIX}West`;
const USER_REJECT = `${USER_PREFIX}Reject`;
const USER_REPEAT = `${USER_PREFIX}Repeat`;
const USER_CHANGED = `${USER_PREFIX}Changed`;
const USER_NOBUDGET = `${USER_PREFIX}NoBudget`;
const USER_TWO = `${USER_PREFIX}TwoBudgets`;
const USER_SHAPE = `${USER_PREFIX}Shape`;
const USER_TYPES = `${USER_PREFIX}Types`;
const USER_MOVED = `${USER_PREFIX}Moved`;

const DAY_MS = 86_400_000;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const creation = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Кошелёк',
  type: 'CASH',
  initialBalance: '125050',
  idempotencyKey: 'form-opened-once',
  ...over,
});

describe('/accounts (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const create = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/accounts')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const list = (userId: string) =>
    request(app.getHttpServer() as Server)
      .get('/accounts')
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
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
        timezone: 'Europe/Warsaw',
        active: true,
        ...over,
      },
    });

  const rowsOf = async (userId: string) => ({
    accounts: await prisma.account.count({ where: { userId } }),
    transactions: await prisma.transaction.count({ where: { userId } }),
    keys: await prisma.idempotencyKey.count({ where: { userId } }),
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

  describe('POST /accounts', () => {
    it('creates the account and its opening income in one go', async () => {
      const budget = await seedBudget(USER_FIRST);

      const response = await create(USER_FIRST, creation());
      expect(response.status).toBe(201);

      const account = await prisma.account.findFirstOrThrow({ where: { userId: USER_FIRST } });
      const transactions = await prisma.transaction.findMany({ where: { userId: USER_FIRST } });

      expect(account).toMatchObject({ name: 'Кошелёк', type: 'CASH', budgetId: budget.id });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        accountId: account.id,
        budgetId: budget.id,
        userId: USER_FIRST,
        categoryId: null,
        transferId: null,
        amount: 125050n,
        type: 'INCOME',
        isSystem: true,
      });
    });

    it('dates the opening income by the budget zone, not by the server clock', async () => {
      await seedBudget(USER_EAST, { timezone: 'Pacific/Kiritimati' });
      await seedBudget(USER_WEST, { timezone: 'Pacific/Niue' });

      await create(USER_EAST, creation());
      await create(USER_WEST, creation());

      const east = await prisma.transaction.findFirstOrThrow({ where: { userId: USER_EAST } });
      const west = await prisma.transaction.findFirstOrThrow({ where: { userId: USER_WEST } });

      // The zones sit 25 hours apart, so one is always at least a calendar day ahead of the
      // other, and for the hour after midnight in Kiritimati it is two. A server clock used
      // instead would date both the same, which is what this refuses.
      expect(east.date.getTime() - west.date.getTime()).toBeGreaterThanOrEqual(DAY_MS);
      expect(calendarDateOf(east.date)).toBe(todayIn('Pacific/Kiritimati'));
      expect(calendarDateOf(west.date)).toBe(todayIn('Pacific/Niue'));
    });

    it('writes the opening income even when the account starts empty', async () => {
      await seedBudget(USER_EMPTY);

      const response = await create(USER_EMPTY, creation({ initialBalance: '0' }));

      expect(response.status).toBe(201);
      await expect(rowsOf(USER_EMPTY)).resolves.toMatchObject({ accounts: 1, transactions: 1 });

      const transaction = await prisma.transaction.findFirstOrThrow({
        where: { userId: USER_EMPTY },
      });
      expect(transaction.amount).toBe(0n);
      expect(transaction.isSystem).toBe(true);
    });

    it('refuses a negative opening balance and writes nothing', async () => {
      await seedBudget(USER_REJECT);

      const response = await create(USER_REJECT, creation({ initialBalance: '-4000' }));

      expect(response.status).toBe(400);
      await expect(rowsOf(USER_REJECT)).resolves.toEqual({
        accounts: 0,
        transactions: 0,
        keys: 0,
      });
    });

    it('refuses a decimal amount rather than truncating it', async () => {
      await seedBudget(USER_REJECT);

      const response = await create(USER_REJECT, creation({ initialBalance: '12.5' }));

      expect(response.status).toBe(400);
      await expect(rowsOf(USER_REJECT)).resolves.toMatchObject({ accounts: 0 });
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a name of nothing but spaces', { name: '   ' }],
      ['a name past the length the column holds', { name: 'x'.repeat(61) }],
      ['a missing amount', { initialBalance: undefined }],
      ['an amount sent as a JSON number', { initialBalance: 125050 }],
      ['a missing idempotency key', { idempotencyKey: undefined }],
    ])('refuses %s', async (_case, over) => {
      await seedBudget(USER_REJECT);

      const response = await create(USER_REJECT, creation(over));

      expect(response.status).toBe(400);
      await expect(rowsOf(USER_REJECT)).resolves.toMatchObject({ accounts: 0 });
    });

    it('trims the edges off the name it stores', async () => {
      await seedBudget(USER_FIRST);

      await create(USER_FIRST, creation({ name: '  Кошелёк  ' }));

      const account = await prisma.account.findFirstOrThrow({ where: { userId: USER_FIRST } });
      expect(account.name).toBe('Кошелёк');
    });

    it('refuses an unknown type, and stores both of the ones it knows', async () => {
      await seedBudget(USER_TYPES);

      const refused = await create(USER_TYPES, creation({ type: 'CREDIT' }));
      expect(refused.status).toBe(400);

      await create(USER_TYPES, creation({ type: 'CASH', idempotencyKey: 'cash' }));
      await create(USER_TYPES, creation({ type: 'DEBIT', idempotencyKey: 'debit' }));

      const accounts = await prisma.account.findMany({
        where: { userId: USER_TYPES },
        orderBy: { type: 'asc' },
      });
      expect(accounts.map((account) => account.type)).toEqual(['CASH', 'DEBIT']);
    });

    it('answers a repeated key with the account it already created', async () => {
      await seedBudget(USER_REPEAT);

      const first = await create(USER_REPEAT, creation());
      const second = await create(USER_REPEAT, creation());

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_REPEAT)).resolves.toMatchObject({ accounts: 1, transactions: 1 });
    });

    it('refuses a repeated key carrying a different intent', async () => {
      await seedBudget(USER_CHANGED);

      await create(USER_CHANGED, creation());
      const second = await create(USER_CHANGED, creation({ name: 'Карта' }));

      expect(second.status).toBe(409);
      await expect(rowsOf(USER_CHANGED)).resolves.toMatchObject({ accounts: 1 });
    });

    it('refuses a repeated key aimed at a budget the caller has since left', async () => {
      // The body is identical; only the budget it means has changed. Answering with the first
      // account would report a write this request never made, in a budget it never named.
      const first = await seedBudget(USER_MOVED);
      await create(USER_MOVED, creation());

      await prisma.budget.update({ where: { id: first.id }, data: { active: false } });
      const second = await seedBudget(USER_MOVED, { name: 'Второй' });

      const repeat = await create(USER_MOVED, creation());

      expect(repeat.status).toBe(409);
      await expect(
        prisma.account.count({ where: { userId: USER_MOVED, budgetId: second.id } }),
      ).resolves.toBe(0);
    });

    it('refuses to create an account when the caller has no active budget', async () => {
      const response = await create(USER_NOBUDGET, creation());

      expect(response.status).toBe(400);
      await expect(rowsOf(USER_NOBUDGET)).resolves.toEqual({
        accounts: 0,
        transactions: 0,
        keys: 0,
      });
    });

    it('answers with the id, the name and the type, and nothing else', async () => {
      await seedBudget(USER_SHAPE);

      const response = await create(USER_SHAPE, creation({ name: 'Карта', type: 'DEBIT' }));
      const document = await generateOpenApiDocument();
      const published = document.components?.schemas?.['AccountResponse'];
      const fields =
        published && 'properties' in published ? Object.keys(published.properties ?? {}) : [];

      expect(response.status).toBe(201);

      const account = asRecord(response.body);
      expect(fields.sort()).toEqual(['id', 'name', 'type']);
      expect(Object.keys(account).sort()).toEqual(fields.sort());
      expect(account).toMatchObject({ name: 'Карта', type: 'DEBIT' });
      expect(typeof account['id']).toBe('string');
    });
  });

  describe('GET /accounts', () => {
    it('lists the active budget accounts and none of a deactivated budget', async () => {
      const active = await seedBudget(USER_TWO);
      const retired = await seedBudget(USER_TWO, { name: 'Старый', active: false });

      await prisma.account.create({
        data: { userId: USER_TWO, budgetId: active.id, name: 'Текущий', type: 'CASH' },
      });
      await prisma.account.create({
        data: { userId: USER_TWO, budgetId: retired.id, name: 'Забытый', type: 'DEBIT' },
      });

      const response = await list(USER_TWO);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(asRecord((response.body as unknown[])[0])).toMatchObject({ name: 'Текущий' });
    });

    it('refuses to list accounts when the caller has no active budget, rather than failing at 500', async () => {
      const response = await list(USER_NOBUDGET);

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
    });

    it('answers with the same shape the contract publishes for one account', async () => {
      const budget = await seedBudget(USER_SHAPE);
      await prisma.account.create({
        data: { userId: USER_SHAPE, budgetId: budget.id, name: 'Кошелёк', type: 'CASH' },
      });

      const response = await list(USER_SHAPE);

      expect(response.status).toBe(200);
      expect(Object.keys(asRecord((response.body as unknown[])[0])).sort()).toEqual([
        'id',
        'name',
        'type',
      ]);
    });
  });
});
