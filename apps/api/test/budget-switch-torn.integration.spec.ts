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

const USER_TORN = 'user_2rondoTornSwitch';

let deactivated = 0;
let refused = 0;

describe('POST /budgets/{id}/activate when the second write fails', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const removeFixtures = async (): Promise<void> => {
    await prisma.idempotencyKey.deleteMany({ where: { userId: USER_TORN } });
    await prisma.budget.deleteMany({ where: { userId: USER_TORN } });
  };

  const seed = (name: string, active: boolean) =>
    prisma.budget.create({
      data: {
        userId: USER_TORN,
        name,
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active,
      },
    });

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
              budget: {
                update({ args, query }) {
                  if (args.data.active === true) {
                    refused += 1;
                    throw new Error('the activating write failed on purpose');
                  }

                  if (args.data.active === false) {
                    deactivated += 1;
                  }

                  return query(args);
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

  it('keeps the previous budget active and claims no key', async () => {
    const first = await seed('Первый', true);
    const second = await seed('Второй', false);
    const now = Math.floor(Date.now() / 1000);
    const token = key.signToken({ sub: USER_TORN, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .post(`/budgets/${second.id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: 'torn' });

    expect(response.status).toBe(500);
    expect(deactivated).toBe(1);
    expect(refused).toBe(1);
    await expect(
      prisma.budget.findUniqueOrThrow({ where: { id: first.id } }),
    ).resolves.toMatchObject({ active: true });
    await expect(
      prisma.budget.findUniqueOrThrow({ where: { id: second.id } }),
    ).resolves.toMatchObject({ active: false });
    await expect(prisma.idempotencyKey.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
  });
});
