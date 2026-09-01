import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { toDbDate, todayIn } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoAccountScoping';

const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;

const ZONE = 'Europe/Warsaw';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

describe('accounts across tenants', () => {
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

  const reconcile = (userId: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post(`/accounts/${id}/reconcile`)
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
    await prisma.account.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedAccount = (userId: string, budgetId: string, name: string) =>
    prisma.account.create({ data: { userId, budgetId, name, type: 'CASH' } });

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

  const seedBudget = (userId: string, name: string) =>
    prisma.budget.create({
      data: {
        userId,
        name,
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
      },
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

  it('shows one user nothing of another user accounts', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    await seedBudget(USER_B, 'B');

    await seedAccount(USER_A, budgetA.id, 'Кошелёк A');

    const seenByB = await readAccounts(USER_B);
    const seenByA = await readAccounts(USER_A);

    expect(seenByB.accounts).toEqual([]);
    expect(seenByA.accounts).toHaveLength(1);
  });

  it('keeps another user money out of every balance and out of the total', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    const budgetB = await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');
    const walletB = await seedAccount(USER_B, budgetB.id, 'Кошелёк B');

    await seedTransaction(USER_A, budgetA.id, walletA.id, 100_000n);
    await seedTransaction(USER_B, budgetB.id, walletB.id, 7_000n);

    const seenByA = await readAccounts(USER_A);
    const seenByB = await readAccounts(USER_B);

    expect(seenByA.accounts.map((account) => account['balance'])).toEqual(['100000']);
    expect(seenByA.total).toBe('100000');
    expect(seenByB.accounts.map((account) => account['balance'])).toEqual(['7000']);
    expect(seenByB.total).toBe('7000');
  });

  it('keeps a second budget of the same caller out of the balances of the active one', async () => {
    const active = await seedBudget(USER_A, 'A');
    const retired = await prisma.budget.create({
      data: {
        userId: USER_A,
        name: 'Старый',
        currency: 'PLN',
        minorDigits: 2,
        timezone: ZONE,
        active: false,
      },
    });

    const current = await seedAccount(USER_A, active.id, 'Текущий');
    const forgotten = await seedAccount(USER_A, retired.id, 'Забытый');

    await seedTransaction(USER_A, active.id, current.id, 40_000n);
    await seedTransaction(USER_A, retired.id, forgotten.id, 500_000n);

    const seen = await readAccounts(USER_A);

    expect(seen.accounts.map((account) => account['name'])).toEqual(['Текущий']);
    expect(seen.total).toBe('40000');
  });

  it('refuses to rename an account belonging to another user, and leaves it untouched', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');

    const response = await rename(USER_B, walletA.id, {
      name: 'Мой теперь',
      idempotencyKey: 'b-opened-the-form',
    });

    expect(response.status).toBe(400);

    const stored = await prisma.account.findFirstOrThrow({ where: { id: walletA.id } });
    expect(stored.name).toBe('Кошелёк A');
  });

  it('leaves a second user holding the same idempotency key alone', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    const budgetB = await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');
    const walletB = await seedAccount(USER_B, budgetB.id, 'Кошелёк B');

    const shared = { name: 'Карта', idempotencyKey: 'both-opened-a-form' };

    const first = await rename(USER_A, walletA.id, shared);
    const second = await rename(USER_B, walletB.id, shared);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    await expect(
      prisma.account.findFirstOrThrow({ where: { id: walletB.id } }),
    ).resolves.toMatchObject({ name: 'Карта' });
  });

  it('creates the account in the caller own budget while another user has one too', async () => {
    await seedBudget(USER_A, 'A');
    const budgetB = await seedBudget(USER_B, 'B');

    const response = await create(USER_B, {
      name: 'Карта B',
      type: 'DEBIT',
      initialBalance: '1000',
      idempotencyKey: 'b-opened-the-form',
    });

    expect(response.status).toBe(201);

    const account = await prisma.account.findFirstOrThrow({ where: { userId: USER_B } });
    expect(account.budgetId).toBe(budgetB.id);
    await expect(prisma.account.count({ where: { userId: USER_A } })).resolves.toBe(0);

    const transaction = await prisma.transaction.findFirstOrThrow({ where: { userId: USER_B } });
    expect(transaction.budgetId).toBe(budgetB.id);
    expect(transaction.userId).toBe(USER_B);
  });

  it('refuses to correct the opening balance of another user, and leaves it untouched', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');
    await seedTransaction(USER_A, budgetA.id, walletA.id, 125_050n, { isSystem: true });

    const response = await correct(USER_B, walletA.id, {
      amount: '1',
      idempotencyKey: 'b-opened-the-opening-form',
    });

    expect(response.status).toBe(400);
    expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');

    const stored = await prisma.transaction.findFirstOrThrow({ where: { userId: USER_A } });
    expect(stored.amount).toBe(125_050n);
  });

  it('reads how editable an opening balance is from the caller own records only', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    const budgetB = await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');
    const walletB = await seedAccount(USER_B, budgetB.id, 'Кошелёк B');

    await seedTransaction(USER_A, budgetA.id, walletA.id, 125_050n, { isSystem: true });
    await seedTransaction(USER_B, budgetB.id, walletB.id, -3_000n, { type: 'EXPENSE' });

    const seen = await readAccounts(USER_A);

    expect(seen.accounts).toHaveLength(1);
    expect(seen.accounts[0]).toMatchObject({ openingEditable: true });
  });
  it('refuses to archive an account belonging to another user, and leaves it open', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');
    await seedTransaction(USER_A, budgetA.id, walletA.id, 0n, { isSystem: true });

    const response = await archive(USER_B, walletA.id, { idempotencyKey: 'b-closes-a-account' });

    expect(response.status).toBe(400);
    expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');

    const stored = await prisma.account.findUniqueOrThrow({ where: { id: walletA.id } });
    expect(stored.archivedAt).toBeNull();
  });

  it('refuses to archive an account of a second budget the caller is not working in', async () => {
    const active = await seedBudget(USER_A, 'A');
    const other = await prisma.budget.create({
      data: {
        userId: USER_A,
        name: 'Второй',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: false,
      },
    });

    await seedAccount(USER_A, active.id, 'Кошелёк');
    const parked = await seedAccount(USER_A, other.id, 'Отложенный');
    await seedTransaction(USER_A, other.id, parked.id, 0n, { isSystem: true });

    const response = await archive(USER_A, parked.id, { idempotencyKey: 'a-closes-the-other' });

    expect(response.status).toBe(400);
    expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');

    const stored = await prisma.account.findUniqueOrThrow({ where: { id: parked.id } });
    expect(stored.archivedAt).toBeNull();
  });
  it('refuses to reconcile an account belonging to another user, and moves none of its money', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    await seedBudget(USER_B, 'B');

    const walletA = await seedAccount(USER_A, budgetA.id, 'Кошелёк A');
    await seedTransaction(USER_A, budgetA.id, walletA.id, 125_050n, { isSystem: true });

    const response = await reconcile(USER_B, walletA.id, {
      balance: '1',
      idempotencyKey: 'b-opened-the-reconcile-form',
    });

    expect(response.status).toBe(400);
    expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');

    const held = await prisma.transaction.findMany({ where: { userId: USER_A } });
    expect(held).toHaveLength(1);
    expect(held[0]?.amount).toBe(125_050n);
  });

  it('refuses to reconcile an account of a second budget the caller is not working in', async () => {
    const active = await seedBudget(USER_A, 'A');
    const other = await prisma.budget.create({
      data: {
        userId: USER_A,
        name: 'Второй',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: false,
      },
    });

    await seedAccount(USER_A, active.id, 'Кошелёк');
    const parked = await seedAccount(USER_A, other.id, 'Отложенный');
    await seedTransaction(USER_A, other.id, parked.id, 7_000n, { isSystem: true });

    const response = await reconcile(USER_A, parked.id, {
      balance: '1',
      idempotencyKey: 'a-reconciles-the-other',
    });

    expect(response.status).toBe(400);
    expect(asRecord(response.body)['reason']).toBe('UNKNOWN_ACCOUNT');

    const held = await prisma.transaction.findMany({ where: { accountId: parked.id } });
    expect(held).toHaveLength(1);
  });
});
