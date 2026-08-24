import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoAccountScoping';

const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;

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

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

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

  it('shows one user nothing of another user accounts', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    await seedBudget(USER_B, 'B');

    await prisma.account.create({
      data: { userId: USER_A, budgetId: budgetA.id, name: 'Кошелёк A', type: 'CASH' },
    });

    const seenByB = await list(USER_B);
    const seenByA = await list(USER_A);

    expect(seenByB.status).toBe(200);
    expect(seenByB.body).toEqual([]);
    expect(seenByA.body).toHaveLength(1);
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
});
