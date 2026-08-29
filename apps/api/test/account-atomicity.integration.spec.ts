import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { ACTIVE_BUDGET_RESOLVER, type ActiveBudgetResolver } from '@/prisma/active-budget.resolver';
import { PrismaService } from '@/prisma/prisma.service';
import { MUTATOR_PRISMA } from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_TORN = 'user_2rondoAccountsTorn';

let refused = 0;

describe('POST /accounts when the opening income fails to write', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: { userId: USER_TORN } });
    await prisma.account.deleteMany({ where: { userId: USER_TORN } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: USER_TORN } });
    await prisma.budget.deleteMany({ where: { userId: USER_TORN } });
    await prisma.userSettings.deleteMany({ where: { userId: USER_TORN } });
  };

  beforeAll(async () => {
    key = createTestSigningKey();
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MUTATOR_PRISMA)
      .useFactory({
        inject: [PrismaService, RequestContextService, ACTIVE_BUDGET_RESOLVER],
        factory: (
          service: PrismaService,
          context: RequestContextService,
          resolveActiveBudget: ActiveBudgetResolver,
        ) =>
          withUserScoping(service, context, resolveActiveBudget).$extends({
            query: {
              transaction: {
                $allOperations() {
                  refused += 1;
                  throw new Error('the opening income failed on purpose');
                },
              },
            },
          }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    prisma = app.get(PrismaService);
    webOrigin = resolveWebOrigin(app.get(ConfigService));
    await removeFixtures();

    await prisma.budget.create({
      data: {
        userId: USER_TORN,
        name: 'Основной',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
      },
    });
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

  it('leaves no account, no opening income and no claimed key', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = key.signToken({ sub: USER_TORN, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Кошелёк',
        type: 'CASH',
        initialBalance: '125050',
        idempotencyKey: 'torn',
      });

    expect(response.status).toBe(500);
    expect(refused).toBeGreaterThan(0);
    await expect(prisma.account.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.transaction.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.idempotencyKey.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
  });
});
