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

const USER_TORN = 'user_2rondoMoveTornAaaa';

let assignmentWritesSeen = 0;

describe('POST /moves when the second side fails to write', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  let source: { id: string };
  let target: { id: string };

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const removeFixtures = async (): Promise<void> => {
    const owned = { userId: USER_TORN };
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
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
              assignment: {
                $allOperations({ args, query }) {
                  assignmentWritesSeen += 1;
                  const isTheSecondSide = assignmentWritesSeen >= 2;

                  if (isTheSecondSide) {
                    throw new Error('the second side failed on purpose');
                  }

                  return query(args);
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

    const budget = await prisma.budget.create({
      data: {
        userId: USER_TORN,
        name: 'Основной',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
      },
    });
    const group = await prisma.categoryGroup.create({
      data: { userId: USER_TORN, budgetId: budget.id, name: 'Дом', sortOrder: 0 },
    });
    source = await prisma.category.create({
      data: {
        userId: USER_TORN,
        budgetId: budget.id,
        groupId: group.id,
        name: 'Еда',
        sortOrder: 0,
      },
    });
    target = await prisma.category.create({
      data: {
        userId: USER_TORN,
        budgetId: budget.id,
        groupId: group.id,
        name: 'Транспорт',
        sortOrder: 1,
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

  it('leaves neither side of the move and no claimed key, having reached the second write', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = key.signToken({ sub: USER_TORN, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .post('/moves')
      .set('Authorization', `Bearer ${token}`)
      .send({
        month: '2026-02',
        amount: '5000',
        from: { kind: 'CATEGORY', categoryId: source.id },
        to: { kind: 'CATEGORY', categoryId: target.id },
        idempotencyKey: 'torn',
      });

    expect(response.status).toBe(500);
    expect(assignmentWritesSeen).toBeGreaterThanOrEqual(2);
    await expect(prisma.assignment.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
    await expect(prisma.idempotencyKey.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
  });
});
