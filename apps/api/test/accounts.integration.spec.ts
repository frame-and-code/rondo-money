import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { calendarDateOf, monthOf, toDbDate, toDbMonth, todayIn } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { generateOpenApiDocument } from '@/openapi/generate';
import { PrismaService } from '@/prisma/prisma.service';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

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
const USER_HOLDING = `${USER_PREFIX}Holding`;
const USER_LEGS = `${USER_PREFIX}Legs`;
const USER_LATER = `${USER_PREFIX}Later`;
const USER_QUIET = `${USER_PREFIX}Quiet`;
const USER_GONE = `${USER_PREFIX}Gone`;
const USER_ORDER = `${USER_PREFIX}Order`;
const USER_COUNTED = `${USER_PREFIX}Counted`;
const USER_WHOLE = `${USER_PREFIX}Whole`;
const USER_NAMED = `${USER_PREFIX}Named`;
const USER_RACE = `${USER_PREFIX}Race`;

const ZONE = 'Europe/Warsaw';

const BEYOND_A_DOUBLE = 9_007_199_254_740_993n;

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

  const rename = (userId: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .patch(`/accounts/${id}`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const readAccounts = async (userId: string) => {
    const response = await list(userId);
    expect(response.status).toBe(200);

    const body = asRecord(response.body);

    return {
      accounts: (body['accounts'] as unknown[]).map(asRecord),
      total: body['total'],
    };
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

  const seedAccount = (
    userId: string,
    budgetId: string,
    name: string,
    over: Record<string, unknown> = {},
  ) => prisma.account.create({ data: { userId, budgetId, name, type: 'CASH', ...over } });

  const seedTransaction = (
    userId: string,
    budgetId: string,
    accountId: string,
    amount: bigint,
    over: Record<string, unknown> = {},
  ) =>
    prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId,
        date: toDbDate(todayIn(ZONE)),
        amount,
        type: 'INCOME',
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
    it('answers with each account balance summed from its own transactions', async () => {
      const budget = await seedBudget(USER_HOLDING);
      const wallet = await seedAccount(USER_HOLDING, budget.id, 'Кошелёк');

      await seedTransaction(USER_HOLDING, budget.id, wallet.id, 125_050n);
      await seedTransaction(USER_HOLDING, budget.id, wallet.id, -25_050n, { type: 'EXPENSE' });

      const { accounts, total } = await readAccounts(USER_HOLDING);

      expect(accounts).toEqual([
        { id: wallet.id, name: 'Кошелёк', type: 'CASH', balance: '100000' },
      ]);
      expect(total).toBe('100000');
    });

    it('moves both accounts of one transfer and leaves the total where it was', async () => {
      const budget = await seedBudget(USER_LEGS);
      const from = await seedAccount(USER_LEGS, budget.id, 'Кошелёк');
      const to = await seedAccount(USER_LEGS, budget.id, 'Карта', { type: 'DEBIT' });

      await seedTransaction(USER_LEGS, budget.id, from.id, 100_000n);

      const transferId = '0199c1a8-9ecf-71c7-a617-c575df073950';
      await seedTransaction(USER_LEGS, budget.id, from.id, -30_000n, {
        type: 'TRANSFER',
        transferId,
      });
      await seedTransaction(USER_LEGS, budget.id, to.id, 30_000n, { type: 'TRANSFER', transferId });

      const { accounts, total } = await readAccounts(USER_LEGS);

      expect(accounts.map((account) => account['balance'])).toEqual(['70000', '30000']);
      expect(total).toBe('100000');
    });

    it('counts a transaction dated after today, because a balance has no date bound', async () => {
      const budget = await seedBudget(USER_LATER);
      const wallet = await seedAccount(USER_LATER, budget.id, 'Кошелёк');
      const later = new Date(toDbDate(todayIn(ZONE)).getTime() + 40 * DAY_MS);

      await seedTransaction(USER_LATER, budget.id, wallet.id, 100_000n);
      await seedTransaction(USER_LATER, budget.id, wallet.id, 5_000n, { date: later });

      const { accounts, total } = await readAccounts(USER_LATER);

      expect(accounts[0]?.['balance']).toBe('105000');
      expect(total).toBe('105000');
    });

    it('keeps an account that has no transactions at all, at a balance of nothing', async () => {
      const budget = await seedBudget(USER_QUIET);
      const opened = await seedAccount(USER_QUIET, budget.id, 'Открытый');
      await seedAccount(USER_QUIET, budget.id, 'Пустой', { type: 'DEBIT' });

      await seedTransaction(USER_QUIET, budget.id, opened.id, 40_000n, { isSystem: true });

      const { accounts, total } = await readAccounts(USER_QUIET);

      expect(accounts.map((account) => [account['name'], account['balance']])).toEqual([
        ['Открытый', '40000'],
        ['Пустой', '0'],
      ]);
      expect(total).toBe('40000');
    });

    it('leaves an archived account out of the list and out of the total', async () => {
      const budget = await seedBudget(USER_GONE);
      const kept = await seedAccount(USER_GONE, budget.id, 'Текущий');
      const archived = await seedAccount(USER_GONE, budget.id, 'Закрытый', {
        archivedAt: new Date(),
      });

      await seedTransaction(USER_GONE, budget.id, kept.id, 60_000n);
      await seedTransaction(USER_GONE, budget.id, archived.id, 15_000n);

      const { accounts, total } = await readAccounts(USER_GONE);

      expect(accounts.map((account) => account['name'])).toEqual(['Текущий']);
      expect(total).toBe('60000');
    });

    it('answers a budget holding no accounts with an empty list and a total of nothing', async () => {
      await seedBudget(USER_EMPTY);

      await expect(readAccounts(USER_EMPTY)).resolves.toEqual({ accounts: [], total: '0' });
    });

    it('lists the accounts oldest first, whatever they are called', async () => {
      const budget = await seedBudget(USER_ORDER);
      const first = await seedAccount(USER_ORDER, budget.id, 'Яблоко');
      const second = await seedAccount(USER_ORDER, budget.id, 'Апельсин');
      const third = await seedAccount(USER_ORDER, budget.id, 'Банан');

      const { accounts } = await readAccounts(USER_ORDER);

      expect(accounts.map((account) => account['id'])).toEqual([first.id, second.id, third.id]);
    });

    it('answers with amounts as strings of minor units, never as numbers', async () => {
      const budget = await seedBudget(USER_SHAPE);
      const wallet = await seedAccount(USER_SHAPE, budget.id, 'Кошелёк');

      await seedTransaction(USER_SHAPE, budget.id, wallet.id, BEYOND_A_DOUBLE);

      const { accounts, total } = await readAccounts(USER_SHAPE);

      expect(typeof accounts[0]?.['balance']).toBe('string');
      expect(typeof total).toBe('string');
      expect(accounts[0]?.['balance']).toBe('9007199254740993');
      expect(total).toBe('9007199254740993');
    });

    it('costs one raw statement whether the budget holds one account or three', async () => {
      const budget = await seedBudget(USER_COUNTED);
      const only = await seedAccount(USER_COUNTED, budget.id, 'Один');
      await seedTransaction(USER_COUNTED, budget.id, only.id, 10_000n);

      const counted = jest.spyOn(ScopedRawRepository.prototype, 'query');

      try {
        await readAccounts(USER_COUNTED);
        const forOne = counted.mock.calls.length;

        await seedAccount(USER_COUNTED, budget.id, 'Два');
        await seedAccount(USER_COUNTED, budget.id, 'Три');

        counted.mockClear();
        const { accounts } = await readAccounts(USER_COUNTED);

        expect(accounts).toHaveLength(3);
        expect(forOne).toBe(1);
        expect(counted).toHaveBeenCalledTimes(forOne);
      } finally {
        counted.mockRestore();
      }
    });

    it('lists the active budget accounts and none of a deactivated budget', async () => {
      const active = await seedBudget(USER_TWO);
      const retired = await seedBudget(USER_TWO, { name: 'Старый', active: false });

      const current = await seedAccount(USER_TWO, active.id, 'Текущий');
      const forgotten = await seedAccount(USER_TWO, retired.id, 'Забытый', { type: 'DEBIT' });

      await seedTransaction(USER_TWO, active.id, current.id, 20_000n);
      await seedTransaction(USER_TWO, retired.id, forgotten.id, 90_000n);

      const { accounts, total } = await readAccounts(USER_TWO);

      expect(accounts.map((account) => account['name'])).toEqual(['Текущий']);
      expect(total).toBe('20000');
    });

    it('refuses to list accounts when the caller has no active budget, rather than failing at 500', async () => {
      const response = await list(USER_NOBUDGET);

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
    });

    it('answers with the shape the contract publishes', async () => {
      const budget = await seedBudget(USER_SHAPE);
      const wallet = await seedAccount(USER_SHAPE, budget.id, 'Кошелёк');
      await seedTransaction(USER_SHAPE, budget.id, wallet.id, 1_000n);

      const document = await generateOpenApiDocument();
      const publishedFields = (name: string): string[] => {
        const schema = document.components?.schemas?.[name];

        return schema && 'properties' in schema ? Object.keys(schema.properties ?? {}) : [];
      };

      const { accounts, total } = await readAccounts(USER_SHAPE);

      expect(publishedFields('AccountsResponse').sort()).toEqual(['accounts', 'total']);
      expect(publishedFields('AccountBalanceResponse').sort()).toEqual([
        'balance',
        'id',
        'name',
        'type',
      ]);
      expect(Object.keys(accounts[0] ?? {}).sort()).toEqual(['balance', 'id', 'name', 'type']);
      expect(typeof total).toBe('string');
    });

    it('answers with a total the budget month agrees with, so the two readings cannot drift', async () => {
      const budget = await seedBudget(USER_WHOLE);
      const wallet = await seedAccount(USER_WHOLE, budget.id, 'Кошелёк');
      const group = await prisma.categoryGroup.create({
        data: { userId: USER_WHOLE, budgetId: budget.id, name: 'Дом', sortOrder: 0 },
      });
      const category = await prisma.category.create({
        data: {
          userId: USER_WHOLE,
          budgetId: budget.id,
          groupId: group.id,
          name: 'Еда',
          sortOrder: 0,
        },
      });

      const month = monthOf(todayIn(ZONE));

      await seedTransaction(USER_WHOLE, budget.id, wallet.id, 125_050n);
      await seedTransaction(USER_WHOLE, budget.id, wallet.id, -5_000n, {
        type: 'EXPENSE',
        categoryId: category.id,
      });
      await prisma.assignment.create({
        data: {
          userId: USER_WHOLE,
          budgetId: budget.id,
          categoryId: category.id,
          month: toDbMonth(month),
          amount: 30_000n,
        },
      });

      const { total } = await readAccounts(USER_WHOLE);

      const view = await request(app.getHttpServer() as Server)
        .get('/budget-view')
        .query({ month })
        .set('Authorization', `Bearer ${tokenFor(USER_WHOLE)}`);

      expect(view.status).toBe(200);

      const seen = asRecord(view.body);
      const available = (seen['groups'] as unknown[])
        .flatMap((group_) => asRecord(group_)['categories'] as unknown[])
        .reduce<bigint>((sum, one) => sum + BigInt(String(asRecord(one)['availableAllTime'])), 0n);

      expect(BigInt(String(total))).toBe(BigInt(String(seen['readyToAssign'])) + available);
    });
  });

  describe('PATCH /accounts/:id', () => {
    const renaming = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      name: 'Карта',
      idempotencyKey: 'rename-form-opened-once',
      ...over,
    });

    it('changes the name and leaves the type, the balance and the opening income alone', async () => {
      const budget = await seedBudget(USER_NAMED);
      const wallet = await seedAccount(USER_NAMED, budget.id, 'Кошелёк', { type: 'DEBIT' });
      await seedTransaction(USER_NAMED, budget.id, wallet.id, 125_050n, { isSystem: true });

      const response = await rename(USER_NAMED, wallet.id, renaming());

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({
        id: wallet.id,
        name: 'Карта',
        type: 'DEBIT',
      });

      const stored = await prisma.account.findFirstOrThrow({ where: { id: wallet.id } });
      const transactions = await prisma.transaction.findMany({ where: { userId: USER_NAMED } });

      expect(stored).toMatchObject({ name: 'Карта', type: 'DEBIT' });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({ amount: 125_050n, isSystem: true });

      const { accounts, total } = await readAccounts(USER_NAMED);
      expect(accounts).toEqual([
        { id: wallet.id, name: 'Карта', type: 'DEBIT', balance: '125050' },
      ]);
      expect(total).toBe('125050');
    });

    it('trims the edges off the name it stores', async () => {
      const budget = await seedBudget(USER_NAMED);
      const wallet = await seedAccount(USER_NAMED, budget.id, 'Кошелёк');

      await rename(USER_NAMED, wallet.id, renaming({ name: '  Карта  ' }));

      const stored = await prisma.account.findFirstOrThrow({ where: { id: wallet.id } });
      expect(stored.name).toBe('Карта');
    });

    it('answers a repeated key with the name it already wrote, and writes nothing again', async () => {
      const budget = await seedBudget(USER_REPEAT);
      const wallet = await seedAccount(USER_REPEAT, budget.id, 'Кошелёк');

      const first = await rename(USER_REPEAT, wallet.id, renaming());
      const second = await rename(USER_REPEAT, wallet.id, renaming());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_REPEAT)).resolves.toMatchObject({ accounts: 1, keys: 1 });
    });

    it('refuses a repeated key carrying a different name', async () => {
      const budget = await seedBudget(USER_CHANGED);
      const wallet = await seedAccount(USER_CHANGED, budget.id, 'Кошелёк');

      await rename(USER_CHANGED, wallet.id, renaming());
      const second = await rename(USER_CHANGED, wallet.id, renaming({ name: 'Наличные' }));

      expect(second.status).toBe(409);

      const stored = await prisma.account.findFirstOrThrow({ where: { id: wallet.id } });
      expect(stored.name).toBe('Карта');
    });

    it('renames once when two requests carrying one key arrive together', async () => {
      const budget = await seedBudget(USER_RACE);
      const wallet = await seedAccount(USER_RACE, budget.id, 'Кошелёк');

      const [first, second] = await Promise.all([
        rename(USER_RACE, wallet.id, renaming()),
        rename(USER_RACE, wallet.id, renaming()),
      ]);

      expect([first.status, second.status]).toEqual([200, 200]);
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_RACE)).resolves.toMatchObject({ keys: 1 });

      const stored = await prisma.account.findFirstOrThrow({ where: { id: wallet.id } });
      expect(stored.name).toBe('Карта');
    });

    it('refuses a repeated key aimed at a budget the caller has since left', async () => {
      const first = await seedBudget(USER_MOVED);
      const wallet = await seedAccount(USER_MOVED, first.id, 'Кошелёк');

      await rename(USER_MOVED, wallet.id, renaming());

      await prisma.budget.update({ where: { id: first.id }, data: { active: false } });
      await seedBudget(USER_MOVED, { name: 'Второй' });

      const repeat = await rename(USER_MOVED, wallet.id, renaming());

      expect(repeat.status).toBe(409);
    });

    it('refuses an account this budget does not hold, rather than failing at 500', async () => {
      await seedBudget(USER_NAMED);

      const response = await rename(USER_NAMED, '0199c1a8-9ecf-71c7-a617-c575df073999', renaming());

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
    });

    it('refuses to rename when the caller has no active budget', async () => {
      const response = await rename(
        USER_NOBUDGET,
        '0199c1a8-9ecf-71c7-a617-c575df073998',
        renaming(),
      );

      expect(response.status).toBe(400);
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a name of nothing but spaces', { name: '   ' }],
      ['a name past the length the field allows', { name: 'x'.repeat(61) }],
      ['a missing idempotency key', { idempotencyKey: undefined }],
      ['a type it was never allowed to change', { type: 'DEBIT' }],
    ])('refuses %s and leaves the name where it was', async (_case, over) => {
      const budget = await seedBudget(USER_REJECT);
      const wallet = await seedAccount(USER_REJECT, budget.id, 'Кошелёк');

      const response = await rename(USER_REJECT, wallet.id, renaming(over));

      expect(response.status).toBe(400);

      const stored = await prisma.account.findFirstOrThrow({ where: { id: wallet.id } });
      expect(stored.name).toBe('Кошелёк');
    });
  });
});
