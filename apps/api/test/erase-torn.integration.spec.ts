import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseCalendarDate, toDbDate } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { ACTIVE_BUDGET_RESOLVER, type ActiveBudgetResolver } from '@/prisma/active-budget.resolver';
import { PrismaService } from '@/prisma/prisma.service';
import { MUTATOR_PRISMA } from '@/prisma/scoped-prisma';
import { withUserScoping } from '@/prisma/user-scoping.extension';
import { RequestContextService } from '@/request-context/request-context.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';
import { heldBy } from './owned-rows';

const USER_TORN = 'user_2rondoTornErase';

const ZONE = 'Europe/Warsaw';

let ran = 0;
let threw = false;

function statementText(args: unknown): string {
  if (typeof args !== 'object' || args === null || !('strings' in args)) {
    throw new Error(
      'A raw statement reached the extension without the shape a Prisma.Sql carries, so this ' +
        'spec can no longer tell which statement it is failing.',
    );
  }

  const { strings } = args;

  return Array.isArray(strings) ? strings.join(' ') : '';
}

describe('POST /me/erase when one statement fails part way through', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: { userId: USER_TORN } });
    await prisma.account.deleteMany({ where: { userId: USER_TORN } });
    await prisma.category.deleteMany({ where: { userId: USER_TORN } });
    await prisma.categoryGroup.deleteMany({ where: { userId: USER_TORN } });
    await prisma.budget.deleteMany({ where: { userId: USER_TORN } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: USER_TORN } });
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
              $executeRaw({ args, query }) {
                ran += 1;
                if (statementText(args).includes('FROM account')) {
                  threw = true;
                  throw new Error('the account statement failed on purpose');
                }

                return query(args);
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
    await prisma.userSettings.create({ data: { userId: USER_TORN, language: 'RU' } });
    const budget = await prisma.budget.create({
      data: {
        userId: USER_TORN,
        name: 'Household',
        currency: 'PLN',
        minorDigits: 2,
        timezone: ZONE,
        active: true,
      },
    });
    const group = await prisma.categoryGroup.create({
      data: { userId: USER_TORN, budgetId: budget.id, name: 'Bills', sortOrder: 0 },
    });
    const category = await prisma.category.create({
      data: {
        userId: USER_TORN,
        budgetId: budget.id,
        groupId: group.id,
        name: 'Rent',
        sortOrder: 0,
      },
    });
    const wallet = await prisma.account.create({
      data: { userId: USER_TORN, budgetId: budget.id, name: 'Wallet', type: 'CASH' },
    });
    await prisma.transaction.create({
      data: {
        userId: USER_TORN,
        budgetId: budget.id,
        accountId: wallet.id,
        categoryId: category.id,
        date: toDbDate(parseCalendarDate('2026-02-10')),
        amount: -120_000n,
        type: 'EXPENSE',
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

  it('leaves every row where it was, and claims no key', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = key.signToken({ sub: USER_TORN, iat: now, exp: now + 60, azp: webOrigin });
    const before = await heldBy(prisma, USER_TORN);
    expect(before.map(([model]) => model)).toEqual(
      expect.arrayContaining(['Transaction', 'Category', 'CategoryGroup']),
    );

    const response = await request(app.getHttpServer() as Server)
      .post('/me/erase')
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: 'torn' });

    expect(response.status).toBe(500);
    expect(threw).toBe(true);
    expect(ran).toBeGreaterThan(1);
    await expect(heldBy(prisma, USER_TORN)).resolves.toEqual(before);
    await expect(prisma.idempotencyKey.count({ where: { userId: USER_TORN } })).resolves.toBe(0);
  });
});
