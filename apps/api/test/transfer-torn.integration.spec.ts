import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { todayIn } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { ACTIVE_BUDGET_RESOLVER, type ActiveBudgetResolver } from '@/prisma/active-budget.resolver';
import { PrismaService } from '@/prisma/prisma.service';
import { MUTATOR_PRISMA } from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER = 'user_2rondoRipped';

const ZONE = 'Europe/Warsaw';

const OPENED = new Date('2020-01-01T09:00:00Z');

let trapped: string | null = null;

let attempts = 0;

describe('a transfer whose second leg fails to write (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  let walletId = '';
  let cardId = '';

  const TODAY = todayIn(ZONE);

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (): string => {
    const now = Math.floor(Date.now() / 1000);

    return key.signToken({ sub: USER, iat: now, exp: now + 60, azp: webOrigin });
  };

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post(path)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(body);

  const patch = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .patch(path)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(body);

  const move = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    fromAccountId: walletId,
    toAccountId: cardId,
    amount: '50000',
    date: TODAY,
    idempotencyKey: `torn-${Math.random().toString(36).slice(2)}`,
    ...over,
  });

  const legsOf = () =>
    prisma.transaction.findMany({ where: { userId: USER }, orderBy: { amount: 'asc' } });

  const keysOf = () => prisma.idempotencyKey.count({ where: { userId: USER } });

  const writeTransfer = async (): Promise<string> => {
    trapped = null;
    const written = await post('/transfers', move()).expect(201);
    const body = written.body as { transferId: string };

    return body.transferId;
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
                $allOperations({ operation, args, query }) {
                  if (operation !== trapped) {
                    return query(args);
                  }

                  attempts += 1;
                  if (attempts > 1) {
                    throw new Error(`the second leg failed on purpose during ${operation}`);
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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.transaction.deleteMany({ where: { userId: USER } });
      await prisma.idempotencyKey.deleteMany({ where: { userId: USER } });
      await prisma.account.deleteMany({ where: { userId: USER } });
      await prisma.budget.deleteMany({ where: { userId: USER } });
      await prisma.userSettings.deleteMany({ where: { userId: USER } });
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
    trapped = null;
    attempts = 0;

    await prisma.transaction.deleteMany({ where: { userId: USER } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: USER } });
    await prisma.account.deleteMany({ where: { userId: USER } });
    await prisma.budget.deleteMany({ where: { userId: USER } });
    await prisma.userSettings.deleteMany({ where: { userId: USER } });

    const budget = await prisma.budget.create({
      data: {
        userId: USER,
        name: 'Основной',
        currency: 'PLN',
        minorDigits: 2,
        timezone: ZONE,
        active: true,
      },
    });
    const wallet = await prisma.account.create({
      data: { userId: USER, budgetId: budget.id, name: 'Кошелёк', type: 'CASH', createdAt: OPENED },
    });
    const card = await prisma.account.create({
      data: { userId: USER, budgetId: budget.id, name: 'Карта', type: 'DEBIT', createdAt: OPENED },
    });

    walletId = wallet.id;
    cardId = card.id;
  });

  it('leaves neither leg nor the key when the second leg is not written', async () => {
    trapped = 'create';

    const answer = await post('/transfers', move());

    expect(answer.status).toBe(500);
    expect(attempts).toBe(2);
    await expect(legsOf()).resolves.toEqual([]);
    await expect(keysOf()).resolves.toBe(0);
  });

  it('leaves both legs as they were when the second leg of an edit is not written', async () => {
    const transferId = await writeTransfer();
    const before = await legsOf();
    const keysBefore = await keysOf();

    trapped = 'update';
    attempts = 0;

    const answer = await patch(`/transfers/${transferId}`, move({ amount: '77000' }));

    expect(answer.status).toBe(500);
    expect(attempts).toBe(2);
    await expect(legsOf()).resolves.toEqual(before);
    await expect(keysOf()).resolves.toBe(keysBefore);
  });

  it('keeps both legs when the second leg of a removal is not deleted', async () => {
    const transferId = await writeTransfer();
    const before = await legsOf();

    trapped = 'delete';
    attempts = 0;

    const answer = await post(`/transfers/${transferId}/delete`, { idempotencyKey: 'torn-delete' });

    expect(answer.status).toBe(500);
    expect(attempts).toBe(2);
    await expect(legsOf()).resolves.toEqual(before);
  });
});
