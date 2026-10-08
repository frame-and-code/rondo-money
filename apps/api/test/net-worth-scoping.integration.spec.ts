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

const USER_PREFIX = 'user_2rondoWorthScope';

const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;

const ZONE = 'Europe/Warsaw';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const namesIn = (body: Record<string, unknown>, field: string): unknown[] =>
  (body[field] as unknown[]).map((entry) => asRecord(entry)['name']);

describe('net worth across tenants', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const worthOf = async (userId: string): Promise<Record<string, unknown>> => {
    const response = await request(app.getHttpServer() as Server)
      .get('/net-worth')
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

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

  const seedBudget = (userId: string, name: string, active = true) =>
    prisma.budget.create({
      data: { userId, name, currency: 'PLN', minorDigits: 2, timezone: ZONE, active },
    });

  const seedEverything = async (
    userId: string,
    budgetId: string,
    label: string,
    held: bigint,
    ownedWorth: bigint,
    owed: bigint,
  ): Promise<void> => {
    const account = await prisma.account.create({
      data: { userId, budgetId, name: `Счёт ${label}`, type: 'CASH' },
    });
    await prisma.transaction.create({
      data: {
        userId,
        budgetId,
        accountId: account.id,
        date: toDbDate(todayIn(ZONE)),
        amount: held,
        type: 'INCOME',
      },
    });
    await prisma.asset.create({
      data: { userId, budgetId, name: `Актив ${label}`, amount: ownedWorth },
    });
    await prisma.liability.create({
      data: { userId, budgetId, name: `Пассив ${label}`, amount: owed },
    });
  };

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

  it('keeps another user money, assets and debts out of every list and every sum', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    const budgetB = await seedBudget(USER_B, 'B');
    await seedEverything(USER_A, budgetA.id, 'A', 1_000n, 20_000n, 300n);
    await seedEverything(USER_B, budgetB.id, 'B', 5n, 70n, 9_000n);

    const worthA = await worthOf(USER_A);
    const worthB = await worthOf(USER_B);

    expect(worthA).toMatchObject({
      accountsTotal: '1000',
      assetsTotal: '20000',
      liabilitiesTotal: '300',
      total: '20700',
    });
    expect(namesIn(worthA, 'accounts')).toEqual(['Счёт A']);
    expect(namesIn(worthA, 'assets')).toEqual(['Актив A']);
    expect(namesIn(worthA, 'liabilities')).toEqual(['Пассив A']);

    expect(worthB).toMatchObject({
      accountsTotal: '5',
      assetsTotal: '70',
      liabilitiesTotal: '9000',
      total: '-8925',
    });
    expect(namesIn(worthB, 'accounts')).toEqual(['Счёт B']);
    expect(namesIn(worthB, 'assets')).toEqual(['Актив B']);
    expect(namesIn(worthB, 'liabilities')).toEqual(['Пассив B']);
  });

  it('keeps a second budget of the same caller out of every list and every sum', async () => {
    const retired = await seedBudget(USER_A, 'Прежний', false);
    const active = await seedBudget(USER_A, 'Текущий');
    await seedEverything(USER_A, retired.id, 'прежний', 4_000n, 80_000n, 600n);
    await seedEverything(USER_A, active.id, 'текущий', 1_000n, 20_000n, 300n);

    const worth = await worthOf(USER_A);

    expect(worth).toMatchObject({
      accountsTotal: '1000',
      assetsTotal: '20000',
      liabilitiesTotal: '300',
      total: '20700',
    });
    expect(namesIn(worth, 'accounts')).toEqual(['Счёт текущий']);
    expect(namesIn(worth, 'assets')).toEqual(['Актив текущий']);
    expect(namesIn(worth, 'liabilities')).toEqual(['Пассив текущий']);
  });
});
