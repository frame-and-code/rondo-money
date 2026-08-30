import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionType } from '@rondo/db';
import { toDbDate, toDbMonth } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoViewScope';

const USER_A = `${USER_PREFIX}Aaaaaaaaaaaa`;
const USER_B = `${USER_PREFIX}Bbbbbbbbbbbb`;

interface ViewCategory {
  id: string;
  name: string;
  assigned: string;
  activity: string;
  available: string;
  target: { amount: string } | null;
}

interface View {
  readyToAssign: string;
  groups: { name: string; categories: ViewCategory[] }[];
}

const asView = (body: unknown): View => {
  const view = body as View;
  if (typeof view?.readyToAssign !== 'string' || !Array.isArray(view.groups)) {
    throw new Error(`Not a budget view: ${JSON.stringify(body)}`);
  }

  return view;
};

const numbersOf = (view: View): Omit<ViewCategory, 'id' | 'target'>[] =>
  view.groups
    .flatMap((group) => group.categories)
    .map(({ name, assigned, activity, available }) => ({ name, assigned, activity, available }));

describe('/budget-view keeps to one caller and one budget (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const viewOf = async (userId: string, month: string): Promise<View> => {
    const response = await request(app.getHttpServer() as Server)
      .get(`/budget-view?month=${month}`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .expect(200);

    return asView(response.body);
  };

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.categoryTarget.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedBudget = async (
    userId: string,
    name: string,
    categoryName: string,
    income: bigint,
    assigned: bigint,
    active = true,
  ): Promise<{ id: string }> => {
    const budget = await prisma.budget.create({
      data: {
        userId,
        name,
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active,
      },
    });
    const account = await prisma.account.create({
      data: { userId, budgetId: budget.id, name: `${name} счёт`, type: 'CASH' },
    });
    const group = await prisma.categoryGroup.create({
      data: { userId, budgetId: budget.id, name: `${name} группа`, sortOrder: 0 },
    });
    const category = await prisma.category.create({
      data: { userId, budgetId: budget.id, groupId: group.id, name: categoryName, sortOrder: 0 },
    });

    await prisma.transaction.create({
      data: {
        userId,
        budgetId: budget.id,
        accountId: account.id,
        date: toDbDate('2026-02-01'),
        amount: income,
        type: TransactionType.INCOME,
      },
    });
    await prisma.assignment.create({
      data: {
        userId,
        budgetId: budget.id,
        categoryId: category.id,
        month: toDbMonth('2026-02'),
        amount: assigned,
      },
    });
    await prisma.categoryTarget.create({
      data: {
        userId,
        budgetId: budget.id,
        categoryId: category.id,
        kind: 'CONTRIBUTE',
        amount: assigned * 10n,
        startMonth: toDbMonth('2026-01'),
      },
    });

    return budget;
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

    await removeFixtures();

    await seedBudget(USER_A, 'Бюджет A', 'Категория A', 111_111n, 11_111n);
    await seedBudget(USER_B, 'Бюджет B', 'Категория B', 222_222n, 22_222n);
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

  it("answers each caller with their own money and never with the other one's", async () => {
    const forA = await viewOf(USER_A, '2026-02');
    const forB = await viewOf(USER_B, '2026-02');

    expect(forA.readyToAssign).toBe('100000');
    expect(numbersOf(forA)).toEqual([
      { name: 'Категория A', assigned: '11111', activity: '0', available: '11111' },
    ]);

    expect(forB.readyToAssign).toBe('200000');
    expect(numbersOf(forB)).toEqual([
      { name: 'Категория B', assigned: '22222', activity: '0', available: '22222' },
    ]);

    expect(JSON.stringify(forB)).not.toContain('111111');
    expect(JSON.stringify(forB)).not.toContain('11111');
    expect(JSON.stringify(forB)).not.toContain('Категория A');
  });

  it('reads the active budget only, when the same caller holds a second one', async () => {
    await seedBudget(USER_A, 'Старый бюджет', 'Старая категория', 999_999n, 99_999n, false);

    const view = await viewOf(USER_A, '2026-02');

    expect(view.readyToAssign).toBe('100000');
    expect(
      view.groups.flatMap((group) => group.categories).map((category) => category.name),
    ).toEqual(['Категория A']);
    expect(JSON.stringify(view)).not.toContain('999999');
  });

  it('never lets a goal cross a caller or a budget through the join that reads it', async () => {
    const forA = await viewOf(USER_A, '2026-02');
    const forB = await viewOf(USER_B, '2026-02');

    const targetsOf = (view: View): (string | null)[] =>
      view.groups
        .flatMap((group) => group.categories)
        .map((category) => category.target?.amount ?? null);

    expect(targetsOf(forA)).toEqual(['111110']);
    expect(targetsOf(forB)).toEqual(['222220']);
  });
});
