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
const USER_OPENING = `${USER_PREFIX}Opening`;
const USER_FROZEN = `${USER_PREFIX}Frozen`;
const USER_NEIGHBOUR = `${USER_PREFIX}Neighbour`;
const USER_CLOSING = `${USER_PREFIX}Closing`;
const USER_HOLDS = `${USER_PREFIX}Holds`;
const USER_OWES = `${USER_PREFIX}Owes`;
const USER_EVENED = `${USER_PREFIX}Evened`;
const USER_CLOSED = `${USER_PREFIX}Closed`;
const USER_SHORT = `${USER_PREFIX}Short`;
const USER_OVER = `${USER_PREFIX}Over`;
const USER_AGREED = `${USER_PREFIX}Agreed`;
const USER_POOL = `${USER_PREFIX}Pool`;
const USER_SUNK = `${USER_PREFIX}Sunk`;
const USER_STAMP = `${USER_PREFIX}Stamp`;
const USER_DATED = `${USER_PREFIX}Dated`;
const USER_OWING = `${USER_PREFIX}Owing`;
const USER_SETTLED = `${USER_PREFIX}Settled`;
const USER_AGAIN = `${USER_PREFIX}Again`;
const USER_SAME = `${USER_PREFIX}Same`;
const USER_OTHERWISE = `${USER_PREFIX}Otherwise`;
const USER_PUBLISHED = `${USER_PREFIX}Published`;
const USER_FROZE = `${USER_PREFIX}Froze`;
const USER_UNDONE = `${USER_PREFIX}Undone`;
const USER_EAST_ZONE = `${USER_PREFIX}EastZone`;
const USER_WEST_ZONE = `${USER_PREFIX}WestZone`;

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

  const archive = (userId: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post(`/accounts/${id}/archive`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const correct = (userId: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .patch(`/accounts/${id}/opening-balance`)
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
        {
          id: wallet.id,
          name: 'Кошелёк',
          type: 'CASH',
          balance: '100000',
          openingEditable: false,
        },
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

    it('says an opening balance still takes a correction until the money moves', async () => {
      const budget = await seedBudget(USER_COUNTED);
      const wallet = await seedAccount(USER_COUNTED, budget.id, 'Кошелёк');
      await seedTransaction(USER_COUNTED, budget.id, wallet.id, 125_050n, { isSystem: true });

      const opened = await readAccounts(USER_COUNTED);
      expect(opened.accounts[0]).toMatchObject({ openingEditable: true });

      await seedTransaction(USER_COUNTED, budget.id, wallet.id, -3_000n, { type: 'EXPENSE' });

      const moved = await readAccounts(USER_COUNTED);
      expect(moved.accounts[0]).toMatchObject({ openingEditable: false });
    });

    it('says an account holding no record at all takes one, rather than reading as frozen', async () => {
      const budget = await seedBudget(USER_QUIET);
      await seedAccount(USER_QUIET, budget.id, 'Пустой');

      const { accounts } = await readAccounts(USER_QUIET);

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({ balance: '0', openingEditable: true });
    });

    it('refuses to list accounts when the caller has no active budget, rather than failing at 500', async () => {
      const response = await list(USER_NOBUDGET);

      expect(response.status).toBe(400);
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
        'openingEditable',
        'type',
      ]);
      expect(Object.keys(accounts[0] ?? {}).sort()).toEqual([
        'balance',
        'id',
        'name',
        'openingEditable',
        'type',
      ]);
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
        {
          id: wallet.id,
          name: 'Карта',
          type: 'DEBIT',
          balance: '125050',
          openingEditable: true,
        },
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

  describe('PATCH /accounts/:id/opening-balance', () => {
    const UNKNOWN_ACCOUNT_ID = '0199c1a8-9ecf-71c7-a617-c575df073999';
    const TRANSFER_ID = '0199c1a8-9ecf-71c7-a617-c575df073998';

    const correction = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      amount: '40000',
      idempotencyKey: 'opening-form-opened-once',
      ...over,
    });

    const openedAccount = async (userId: string) => {
      const budget = await seedBudget(userId);
      const wallet = await seedAccount(userId, budget.id, 'Кошелёк');
      const opening = await seedTransaction(userId, budget.id, wallet.id, 125_050n, {
        isSystem: true,
      });

      return { budget, wallet, opening };
    };

    const openingOf = (userId: string) =>
      prisma.transaction.findFirstOrThrow({ where: { userId, isSystem: true } });

    const readyToAssign = async (userId: string): Promise<string> => {
      const view = await request(app.getHttpServer() as Server)
        .get('/budget-view')
        .query({ month: monthOf(todayIn(ZONE)) })
        .set('Authorization', `Bearer ${tokenFor(userId)}`);

      expect(view.status).toBe(200);

      return String(asRecord(view.body)['readyToAssign']);
    };

    it('corrects what the account opened with, and the balance and the pool follow it', async () => {
      const { wallet } = await openedAccount(USER_OPENING);

      const response = await correct(USER_OPENING, wallet.id, correction());

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({
        accountId: wallet.id,
        amount: '40000',
        isSystem: true,
      });

      const { accounts, total } = await readAccounts(USER_OPENING);
      expect(accounts[0]).toMatchObject({ balance: '40000' });
      expect(total).toBe('40000');
      await expect(readyToAssign(USER_OPENING)).resolves.toBe('40000');
    });

    it('takes zero, because an account can be opened with a number that was wrong twice', async () => {
      const { wallet } = await openedAccount(USER_OPENING);

      const response = await correct(USER_OPENING, wallet.id, correction({ amount: '0' }));

      expect(response.status).toBe(200);
      await expect(openingOf(USER_OPENING)).resolves.toMatchObject({ amount: 0n });

      const { total } = await readAccounts(USER_OPENING);
      expect(total).toBe('0');
    });

    it('refuses a negative amount and leaves the balance where it was', async () => {
      const { wallet } = await openedAccount(USER_OPENING);

      const response = await correct(USER_OPENING, wallet.id, correction({ amount: '-4000' }));

      expect(response.status).toBe(400);
      await expect(openingOf(USER_OPENING)).resolves.toMatchObject({ amount: 125_050n });
    });

    it.each([
      ['a decimal amount', { amount: '400.50' }],
      ['an amount sent as a JSON number', { amount: 40_000 }],
      ['a missing amount', { amount: undefined }],
      ['a missing idempotency key', { idempotencyKey: undefined }],
      ['a day, which belongs to the account rather than to the correction', { date: '2026-01-01' }],
      ['a kind, because an opening balance is never an expense', { type: 'EXPENSE' }],
      [
        'an envelope, because the money arrived ready to assign',
        { categoryId: UNKNOWN_ACCOUNT_ID },
      ],
    ])('refuses %s', async (_case, over) => {
      const { wallet } = await openedAccount(USER_OPENING);

      const response = await correct(USER_OPENING, wallet.id, correction(over));

      expect(response.status).toBe(400);
      await expect(openingOf(USER_OPENING)).resolves.toMatchObject({ amount: 125_050n });
    });

    it('leaves the day and the kind of the record it corrects alone', async () => {
      const { opening, wallet } = await openedAccount(USER_OPENING);

      await correct(USER_OPENING, wallet.id, correction());

      const stored = await openingOf(USER_OPENING);
      expect(stored).toMatchObject({
        id: opening.id,
        date: opening.date,
        type: opening.type,
        categoryId: null,
        isSystem: true,
      });
    });

    it('refuses the correction once the account holds a record of its own', async () => {
      const { budget, wallet } = await openedAccount(USER_FROZEN);
      await seedTransaction(USER_FROZEN, budget.id, wallet.id, -3_000n, { type: 'EXPENSE' });

      const response = await correct(USER_FROZEN, wallet.id, correction());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('OPENING_FROZEN');
      await expect(openingOf(USER_FROZEN)).resolves.toMatchObject({ amount: 125_050n });
    });

    it('takes the correction again once that record is gone', async () => {
      const { budget, wallet } = await openedAccount(USER_FROZEN);
      const spent = await seedTransaction(USER_FROZEN, budget.id, wallet.id, -3_000n, {
        type: 'EXPENSE',
      });

      await correct(USER_FROZEN, wallet.id, correction()).expect(400);
      await prisma.transaction.delete({ where: { id: spent.id } });

      const response = await correct(
        USER_FROZEN,
        wallet.id,
        correction({ idempotencyKey: 'opening-form-opened-again' }),
      );

      expect(response.status).toBe(200);
      await expect(openingOf(USER_FROZEN)).resolves.toMatchObject({ amount: 40_000n });
    });

    it('counts a transfer leg as a record of its own, because the money did move', async () => {
      const { budget, wallet } = await openedAccount(USER_FROZEN);
      await seedTransaction(USER_FROZEN, budget.id, wallet.id, -5_000n, {
        type: 'TRANSFER',
        transferId: TRANSFER_ID,
      });

      const response = await correct(USER_FROZEN, wallet.id, correction());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('OPENING_FROZEN');
    });

    it('leaves an account editable while the money moved on another one', async () => {
      const { budget, wallet } = await openedAccount(USER_NEIGHBOUR);
      const other = await seedAccount(USER_NEIGHBOUR, budget.id, 'Карта');
      await seedTransaction(USER_NEIGHBOUR, budget.id, other.id, -3_000n, { type: 'EXPENSE' });

      const response = await correct(USER_NEIGHBOUR, wallet.id, correction());

      expect(response.status).toBe(200);
      await expect(openingOf(USER_NEIGHBOUR)).resolves.toMatchObject({ amount: 40_000n });
    });

    it('answers a repeated key with what it already wrote, and writes nothing again', async () => {
      const { wallet } = await openedAccount(USER_REPEAT);

      const first = await correct(USER_REPEAT, wallet.id, correction());
      const second = await correct(USER_REPEAT, wallet.id, correction());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_REPEAT)).resolves.toMatchObject({ transactions: 1, keys: 1 });
    });

    it('refuses a repeated key carrying a different amount', async () => {
      const { wallet } = await openedAccount(USER_CHANGED);

      await correct(USER_CHANGED, wallet.id, correction());
      const second = await correct(USER_CHANGED, wallet.id, correction({ amount: '999' }));

      expect(second.status).toBe(409);
      await expect(openingOf(USER_CHANGED)).resolves.toMatchObject({ amount: 40_000n });
    });

    it('refuses an account this budget does not hold', async () => {
      await openedAccount(USER_GONE);

      const response = await correct(USER_GONE, UNKNOWN_ACCOUNT_ID, correction());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');
    });

    it('refuses to invent an opening balance for an account that lost the one it had', async () => {
      const budget = await seedBudget(USER_QUIET);
      const wallet = await seedAccount(USER_QUIET, budget.id, 'Кошелёк');

      const response = await correct(USER_QUIET, wallet.id, correction());

      expect(response.status).toBe(500);
      await expect(prisma.transaction.count({ where: { userId: USER_QUIET } })).resolves.toBe(0);
    });

    it('refuses a caller with no active budget rather than failing on the way down', async () => {
      const response = await correct(USER_NOBUDGET, UNKNOWN_ACCOUNT_ID, correction());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
    });
  });
  describe('POST /accounts/:id/archive', () => {
    const NO_SUCH_ACCOUNT = '0199c1a8-9ecf-71c7-a617-c575df073998';

    const closing = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      idempotencyKey: 'archive-asked-once',
      ...over,
    });

    const accountWith = async (userId: string, opening: bigint) => {
      const budget = await seedBudget(userId);
      const wallet = await seedAccount(userId, budget.id, 'Кошелёк');
      await seedTransaction(userId, budget.id, wallet.id, opening, { isSystem: true });

      return { budget, wallet };
    };

    const storedAccount = (id: string) => prisma.account.findUniqueOrThrow({ where: { id } });

    it('archives an account that holds nothing at all', async () => {
      const { wallet } = await accountWith(USER_CLOSING, 0n);

      const response = await archive(USER_CLOSING, wallet.id, closing());

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({ id: wallet.id, name: 'Кошелёк' });
      expect((await storedAccount(wallet.id)).archivedAt).not.toBeNull();
    });

    it('refuses an account whose only record is the money it was opened with', async () => {
      const { wallet } = await accountWith(USER_HOLDS, 5_000n);

      const response = await archive(USER_HOLDS, wallet.id, closing());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)).toMatchObject({
        reason: 'BALANCE_NOT_ZERO',
        balance: '5000',
      });
      await expect(storedAccount(wallet.id)).resolves.toMatchObject({ archivedAt: null });
    });

    it('refuses an account holding a debt, because a hidden minus is the same lost money', async () => {
      const { budget, wallet } = await accountWith(USER_OWES, 0n);
      await seedTransaction(USER_OWES, budget.id, wallet.id, -3_000n, { type: 'EXPENSE' });

      const response = await archive(USER_OWES, wallet.id, closing());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)).toMatchObject({
        reason: 'BALANCE_NOT_ZERO',
        balance: '-3000',
      });
      await expect(storedAccount(wallet.id)).resolves.toMatchObject({ archivedAt: null });
    });

    it('archives an account whose records add up to nothing, records or not', async () => {
      const { budget, wallet } = await accountWith(USER_EVENED, 10_000n);
      await seedTransaction(USER_EVENED, budget.id, wallet.id, -10_000n, { type: 'EXPENSE' });

      const response = await archive(USER_EVENED, wallet.id, closing());

      expect(response.status).toBe(200);
      expect((await storedAccount(wallet.id)).archivedAt).not.toBeNull();
      await expect(prisma.transaction.count({ where: { accountId: wallet.id } })).resolves.toBe(2);
    });

    it('refuses to archive the same account a second time', async () => {
      const { wallet } = await accountWith(USER_CLOSED, 0n);

      await archive(USER_CLOSED, wallet.id, closing()).expect(200);
      const again = await archive(
        USER_CLOSED,
        wallet.id,
        closing({ idempotencyKey: 'archive-asked-again' }),
      );

      expect(again.status).toBe(400);
      expect(asRecord(again.body)['reason']).toBe('ACCOUNT_ARCHIVED');
    });

    it('refuses to rename an archived account, because it takes no write of any kind', async () => {
      const { wallet } = await accountWith(USER_CLOSED, 0n);
      await archive(USER_CLOSED, wallet.id, closing()).expect(200);

      const response = await rename(USER_CLOSED, wallet.id, {
        name: 'Старый',
        idempotencyKey: 'rename-after-closing',
      });

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('ACCOUNT_ARCHIVED');
      await expect(storedAccount(wallet.id)).resolves.toMatchObject({ name: 'Кошелёк' });
    });

    it('refuses to correct the opening balance of an archived account, which would leave zero behind everything else', async () => {
      const { wallet } = await accountWith(USER_CLOSED, 0n);
      await archive(USER_CLOSED, wallet.id, closing()).expect(200);

      const response = await correct(USER_CLOSED, wallet.id, {
        amount: '40000',
        idempotencyKey: 'opening-after-closing',
      });

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('ACCOUNT_ARCHIVED');
      await expect(
        prisma.transaction.findFirstOrThrow({ where: { accountId: wallet.id } }),
      ).resolves.toMatchObject({ amount: 0n });
    });

    it('answers a repeated key with what it already wrote, and archives nothing twice', async () => {
      const { wallet } = await accountWith(USER_REPEAT, 0n);

      const first = await archive(USER_REPEAT, wallet.id, closing());
      const second = await archive(USER_REPEAT, wallet.id, closing());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_REPEAT)).resolves.toMatchObject({ keys: 1 });
    });

    it('leaves the list holding exactly the accounts that are left, and a total that is their sum', async () => {
      const budget = await seedBudget(USER_GONE);
      const kept = await seedAccount(USER_GONE, budget.id, 'Текущий');
      const closed = await seedAccount(USER_GONE, budget.id, 'Закрываемый');
      await seedTransaction(USER_GONE, budget.id, kept.id, 60_000n, { isSystem: true });
      await seedTransaction(USER_GONE, budget.id, closed.id, 0n, { isSystem: true });

      await archive(USER_GONE, closed.id, closing()).expect(200);

      const { accounts, total } = await readAccounts(USER_GONE);

      expect(accounts.map((account) => [account['id'], account['balance']])).toEqual([
        [kept.id, '60000'],
      ]);
      expect(total).toBe('60000');
    });

    it('refuses an account this budget does not hold', async () => {
      await accountWith(USER_CLOSING, 0n);

      const response = await archive(USER_CLOSING, NO_SUCH_ACCOUNT, closing());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');
    });

    it('refuses a caller with no active budget rather than failing on the way down', async () => {
      const response = await archive(USER_NOBUDGET, NO_SUCH_ACCOUNT, closing());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
    });
  });
  describe('POST /accounts/:id/reconcile', () => {
    const NO_SUCH_ONE = '0199c1a8-9ecf-71c7-a617-c575df073997';

    const settlement = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      balance: '150000',
      idempotencyKey: 'reconcile-form-opened-once',
      ...over,
    });

    const reconcile = (userId: string, id: string, body: Record<string, unknown>) =>
      request(app.getHttpServer() as Server)
        .post(`/accounts/${id}/reconcile`)
        .set('Authorization', `Bearer ${tokenFor(userId)}`)
        .send(body);

    const heldAccount = async (userId: string, holding = 125_050n) => {
      const budget = await seedBudget(userId);
      const wallet = await seedAccount(userId, budget.id, 'Кошелёк');
      await seedTransaction(userId, budget.id, wallet.id, holding, { isSystem: true });

      return { budget, wallet };
    };

    const balanceOf = async (userId: string, accountId: string): Promise<bigint> => {
      const rows = await prisma.transaction.findMany({ where: { userId, accountId } });

      return rows.reduce((sum, row) => sum + row.amount, 0n);
    };

    const poolOf = async (userId: string): Promise<bigint> => {
      const view = await request(app.getHttpServer() as Server)
        .get('/budget-view')
        .query({ month: monthOf(todayIn(ZONE)) })
        .set('Authorization', `Bearer ${tokenFor(userId)}`);

      expect(view.status).toBe(200);

      return BigInt(String(asRecord(view.body)['readyToAssign']));
    };

    it('settles a balance the book fell short of with one correction for the difference', async () => {
      const { wallet } = await heldAccount(USER_SHORT);

      const response = await reconcile(USER_SHORT, wallet.id, settlement());

      expect(response.status).toBe(200);
      expect(asRecord(response.body)['difference']).toBe('24950');

      const written = await prisma.transaction.findMany({
        where: { userId: USER_SHORT, isSystem: false },
      });

      expect(written).toHaveLength(1);
      expect(written[0]?.amount).toBe(24_950n);
      expect(asRecord(response.body)['adjustmentId']).toBe(written[0]?.id);
      await expect(balanceOf(USER_SHORT, wallet.id)).resolves.toBe(150_000n);
    });

    it('settles a balance the book overstated with one correction below zero', async () => {
      const { wallet } = await heldAccount(USER_OVER);

      const response = await reconcile(USER_OVER, wallet.id, settlement({ balance: '100000' }));

      expect(response.status).toBe(200);
      expect(asRecord(response.body)['difference']).toBe('-25050');

      const written = await prisma.transaction.findMany({
        where: { userId: USER_OVER, isSystem: false },
      });

      expect(written).toHaveLength(1);
      expect(written[0]?.amount).toBe(-25_050n);
      await expect(balanceOf(USER_OVER, wallet.id)).resolves.toBe(100_000n);
    });

    it('writes nothing at all when the book already agreed with the account', async () => {
      const { wallet } = await heldAccount(USER_AGREED);

      const response = await reconcile(USER_AGREED, wallet.id, settlement({ balance: '125050' }));

      expect(response.status).toBe(200);
      expect(asRecord(response.body)).toMatchObject({ difference: '0', adjustmentId: null });
      await expect(rowsOf(USER_AGREED)).resolves.toMatchObject({ transactions: 1 });
    });

    it('moves the pool by the difference and leaves every envelope where it was', async () => {
      const { budget, wallet } = await heldAccount(USER_POOL);
      const group = await prisma.categoryGroup.create({
        data: { userId: USER_POOL, budgetId: budget.id, name: 'Дом', sortOrder: 0 },
      });
      const category = await prisma.category.create({
        data: {
          userId: USER_POOL,
          budgetId: budget.id,
          groupId: group.id,
          name: 'Еда',
          sortOrder: 0,
        },
      });
      await prisma.assignment.create({
        data: {
          userId: USER_POOL,
          budgetId: budget.id,
          categoryId: category.id,
          month: toDbMonth(monthOf(todayIn(ZONE))),
          amount: 30_000n,
        },
      });

      const before = await poolOf(USER_POOL);

      const response = await reconcile(USER_POOL, wallet.id, settlement());
      expect(response.status).toBe(200);

      const assignments = await prisma.assignment.findMany({ where: { userId: USER_POOL } });

      await expect(poolOf(USER_POOL)).resolves.toBe(before + 24_950n);
      expect(assignments.map((row) => row.amount)).toEqual([30_000n]);
    });

    it('lets a correction sink the pool below zero, which is a signal rather than a refusal', async () => {
      const { wallet } = await heldAccount(USER_SUNK, 1_000n);

      const response = await reconcile(USER_SUNK, wallet.id, settlement({ balance: '0' }));

      expect(response.status).toBe(200);
      await expect(poolOf(USER_SUNK)).resolves.toBe(0n);

      const deeper = await reconcile(
        USER_SUNK,
        wallet.id,
        settlement({ balance: '-5000', idempotencyKey: 'reconcile-again' }),
      );

      expect(deeper.status).toBe(200);
      await expect(poolOf(USER_SUNK)).resolves.toBe(-5_000n);
    });

    it('writes the correction as an ordinary record carrying no envelope', async () => {
      const { budget, wallet } = await heldAccount(USER_STAMP);

      await reconcile(USER_STAMP, wallet.id, settlement());

      const written = await prisma.transaction.findFirstOrThrow({
        where: { userId: USER_STAMP, isSystem: false },
      });

      expect(written).toMatchObject({
        accountId: wallet.id,
        budgetId: budget.id,
        categoryId: null,
        transferId: null,
        payee: null,
        type: 'ADJUSTMENT',
        isSystem: false,
      });
    });

    it('dates the correction by the budget zone, not by the server clock', async () => {
      const east = await seedBudget(USER_EAST_ZONE, { timezone: 'Pacific/Kiritimati' });
      const west = await seedBudget(USER_WEST_ZONE, { timezone: 'Pacific/Niue' });
      const there = await seedAccount(USER_EAST_ZONE, east.id, 'Кошелёк');
      const here = await seedAccount(USER_WEST_ZONE, west.id, 'Кошелёк');

      await reconcile(USER_EAST_ZONE, there.id, settlement());
      await reconcile(USER_WEST_ZONE, here.id, settlement());

      const first = await prisma.transaction.findFirstOrThrow({
        where: { userId: USER_EAST_ZONE },
      });
      const second = await prisma.transaction.findFirstOrThrow({
        where: { userId: USER_WEST_ZONE },
      });

      expect(first.date.getTime() - second.date.getTime()).toBeGreaterThanOrEqual(DAY_MS);
      expect(calendarDateOf(first.date)).toBe(todayIn('Pacific/Kiritimati'));
      expect(calendarDateOf(second.date)).toBe(todayIn('Pacific/Niue'));
    });

    it('refuses a body naming a day, because a reconciliation happens today by definition', async () => {
      const { wallet } = await heldAccount(USER_DATED);

      const response = await reconcile(USER_DATED, wallet.id, settlement({ date: todayIn(ZONE) }));

      expect(response.status).toBe(400);
      await expect(rowsOf(USER_DATED)).resolves.toMatchObject({ transactions: 1 });
    });

    it('takes a declared balance below zero, because an account can be spent past its own money', async () => {
      const { wallet } = await heldAccount(USER_OWING, 0n);

      const response = await reconcile(USER_OWING, wallet.id, settlement({ balance: '-4500' }));

      expect(response.status).toBe(200);
      expect(asRecord(response.body)['difference']).toBe('-4500');
      await expect(balanceOf(USER_OWING, wallet.id)).resolves.toBe(-4_500n);
    });

    it('refuses to reconcile an archived account, which takes no write of any kind', async () => {
      const { wallet } = await heldAccount(USER_SETTLED);
      await prisma.account.update({ where: { id: wallet.id }, data: { archivedAt: new Date() } });

      const response = await reconcile(USER_SETTLED, wallet.id, settlement());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('ACCOUNT_ARCHIVED');
      await expect(rowsOf(USER_SETTLED)).resolves.toMatchObject({ transactions: 1 });
    });

    it('refuses an account this budget does not hold, rather than failing at 500', async () => {
      await heldAccount(USER_OTHERWISE);

      const response = await reconcile(USER_OTHERWISE, NO_SUCH_ONE, settlement());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');
    });

    it('refuses a caller with no active budget rather than failing on the way down', async () => {
      const response = await reconcile(USER_NOBUDGET, NO_SUCH_ONE, settlement());

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
    });

    it('answers a repeated key with what it already wrote, and corrects nothing twice', async () => {
      const { wallet } = await heldAccount(USER_AGAIN);

      const first = await reconcile(USER_AGAIN, wallet.id, settlement());
      const second = await reconcile(USER_AGAIN, wallet.id, settlement());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_AGAIN)).resolves.toMatchObject({ transactions: 2 });
    });

    it('answers a repeated key over an agreement with the same empty result', async () => {
      const { wallet } = await heldAccount(USER_SAME);

      const first = await reconcile(USER_SAME, wallet.id, settlement({ balance: '125050' }));
      const second = await reconcile(USER_SAME, wallet.id, settlement({ balance: '125050' }));

      expect(first.body).toMatchObject({ difference: '0', adjustmentId: null });
      expect(second.body).toEqual(first.body);
      await expect(rowsOf(USER_SAME)).resolves.toMatchObject({ transactions: 1 });
    });

    it('refuses a repeated key carrying a different balance', async () => {
      const { wallet } = await heldAccount(USER_REPEAT);

      const first = await reconcile(USER_REPEAT, wallet.id, settlement());
      const second = await reconcile(USER_REPEAT, wallet.id, settlement({ balance: '900' }));

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      await expect(rowsOf(USER_REPEAT)).resolves.toMatchObject({ transactions: 2 });
    });

    it('answers with the shape the contract publishes', async () => {
      const { wallet } = await heldAccount(USER_PUBLISHED);

      const document = await generateOpenApiDocument();
      const schema = document.components?.schemas?.['ReconciliationResponse'];
      const published =
        schema && 'properties' in schema ? Object.keys(schema.properties ?? {}) : [];

      const response = await reconcile(USER_PUBLISHED, wallet.id, settlement());

      expect(published.sort()).toEqual(['adjustmentId', 'difference']);
      expect(Object.keys(asRecord(response.body)).sort()).toEqual(['adjustmentId', 'difference']);
    });

    it('freezes what the account opened with, because the correction is a record of its own', async () => {
      const { wallet } = await heldAccount(USER_FROZE);

      const before = await readAccounts(USER_FROZE);
      expect(before.accounts[0]?.['openingEditable']).toBe(true);

      await reconcile(USER_FROZE, wallet.id, settlement());

      const after = await readAccounts(USER_FROZE);
      expect(after.accounts[0]?.['openingEditable']).toBe(false);
    });

    it('lets the correction be removed like any other record, and the balance follows it back', async () => {
      const { wallet } = await heldAccount(USER_UNDONE);

      const written = await reconcile(USER_UNDONE, wallet.id, settlement());
      const adjustmentId = String(asRecord(written.body)['adjustmentId']);

      const removed = await request(app.getHttpServer() as Server)
        .post(`/transactions/${adjustmentId}/delete`)
        .set('Authorization', `Bearer ${tokenFor(USER_UNDONE)}`)
        .send({ idempotencyKey: 'undo-the-reconciliation' });

      expect(removed.status).toBe(200);
      await expect(balanceOf(USER_UNDONE, wallet.id)).resolves.toBe(125_050n);
    });
  });
});
