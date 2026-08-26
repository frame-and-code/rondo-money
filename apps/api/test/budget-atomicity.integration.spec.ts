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

const USER_TORN = 'user_2rondoBudgetsTorn';

let refused = 0;

describe('POST /budgets when a write fails part way through', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const removeFixtures = async (): Promise<void> => {
    await prisma.category.deleteMany({ where: { userId: USER_TORN } });
    await prisma.categoryGroup.deleteMany({ where: { userId: USER_TORN } });
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
              category: {
                $allOperations() {
                  refused += 1;
                  throw new Error('the category write failed on purpose');
                },
              },
            },
          }),
      })
      .compile();

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

  it('leaves no budget, no group, no category, no language and no claimed key', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = key.signToken({ sub: USER_TORN, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .post('/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        language: 'ru',
        name: 'Основной',
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
        withDefaultCategories: true,
        idempotencyKey: 'torn',
      });

    expect(response.status).toBe(500);
    expect(refused).toBeGreaterThan(0);
    await expect(prisma.budget.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.categoryGroup.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.category.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.idempotencyKey.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.userSettings.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
  });
});
