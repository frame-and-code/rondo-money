import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TransactionType } from '@rondo/db';
import { toDbDate, toDbMonth } from '@rondo/types';
import fc from 'fast-check';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER = 'user_2rondoInvariantAaaaaaaaaa';

const ALL_TIME = '2400-01';

const DATES = [
  '2026-01-01',
  '2026-01-31',
  '2026-02-01',
  '2026-02-28',
  '2026-03-15',
  '2026-06-30',
] as const;

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-06', '2027-01'] as const;

const POOL = null;

type Side = number | typeof POOL;

type Operation =
  | { kind: 'income'; amount: bigint; date: string }
  | { kind: 'expense'; amount: bigint; date: string; category: number }
  | { kind: 'assign'; amount: bigint; month: string; category: number }
  | { kind: 'move'; amount: bigint; month: string; from: Side; to: Side }
  | { kind: 'hide'; category: number };

const CATEGORIES = 3;

const SIDES: readonly Side[] = [POOL, 0, 1, 2];

let movesApplied = 0;
let movesLanded = 0;
let hidesApplied = 0;
let hidesLanded = 0;

const operation = (): fc.Arbitrary<Operation> =>
  fc.oneof(
    fc.record({
      kind: fc.constant<'income'>('income'),
      amount: fc.bigInt({ min: 1n, max: 500_000n }),
      date: fc.constantFrom(...DATES),
    }),
    fc.record({
      kind: fc.constant<'expense'>('expense'),
      amount: fc.bigInt({ min: 1n, max: 200_000n }),
      date: fc.constantFrom(...DATES),
      category: fc.integer({ min: 0, max: CATEGORIES - 1 }),
    }),
    fc.record({
      kind: fc.constant<'assign'>('assign'),
      amount: fc.bigInt({ min: -100_000n, max: 300_000n }),
      month: fc.constantFrom(...MONTHS),
      category: fc.integer({ min: 0, max: CATEGORIES - 1 }),
    }),
    fc.record({
      kind: fc.constant<'move'>('move'),
      amount: fc.bigInt({ min: 1n, max: 300_000n }),
      month: fc.constantFrom(...MONTHS),
      from: fc.constantFrom(...SIDES),
      to: fc.constantFrom(...SIDES),
    }),
    fc.record({
      kind: fc.constant<'hide'>('hide'),
      category: fc.integer({ min: 0, max: CATEGORIES - 1 }),
    }),
  );

interface View {
  readyToAssign: string;
  groups: { categories: { available: string }[] }[];
}

describe('invariant 5.5 (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  let budgetId: string;
  let accountId: string;
  let categoryIds: string[] = [];

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: USER, iat: now, exp: now + 60, azp: webOrigin });
  };

  const allTimeView = async (includeHidden = true): Promise<View> => {
    const response = await request(app.getHttpServer() as Server)
      .get(`/budget-view?month=${ALL_TIME}&includeHidden=${includeHidden ? 'true' : 'false'}`)
      .set('Authorization', `Bearer ${tokenFor()}`)
      .expect(200);

    const view = response.body as View;
    if (typeof view?.readyToAssign !== 'string' || !Array.isArray(view.groups)) {
      throw new Error(`Not a budget view: ${JSON.stringify(response.body)}`);
    }

    return view;
  };

  const owned = { userId: USER };

  const clearMoney = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.category.updateMany({ where: owned, data: { hiddenAt: null } });
  };

  const sideOf = (side: Side): Record<string, unknown> =>
    side === POOL
      ? { kind: 'READY_TO_ASSIGN' }
      : { kind: 'CATEGORY', categoryId: categoryIds[side] ?? '' };

  const apply = async (step: Operation): Promise<void> => {
    if (step.kind === 'hide') {
      hidesApplied += 1;
      const hidden = await request(app.getHttpServer() as Server)
        .post(`/categories/${categoryIds[step.category] ?? ''}/hide`)
        .set('Authorization', `Bearer ${tokenFor()}`)
        .send({ idempotencyKey: `invariant-hide-${hidesApplied}` });

      expect([201, 400]).toContain(hidden.status);
      if (hidden.status === 201) {
        hidesLanded += 1;
      }

      return;
    }

    if (step.kind === 'move') {
      const bothSidesAreOneEnvelope = step.from === step.to;
      if (bothSidesAreOneEnvelope) {
        return;
      }

      movesApplied += 1;
      const answer = await request(app.getHttpServer() as Server)
        .post('/moves')
        .set('Authorization', `Bearer ${tokenFor()}`)
        .send({
          month: step.month,
          amount: step.amount.toString(10),
          from: sideOf(step.from),
          to: sideOf(step.to),
          idempotencyKey: `invariant-move-${movesApplied}`,
        });

      expect([201, 400]).toContain(answer.status);
      if (answer.status === 201) {
        movesLanded += 1;
      }

      return;
    }

    if (step.kind === 'assign') {
      const categoryId = categoryIds[step.category] ?? '';
      const target = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
      if (target.hiddenAt !== null) {
        return;
      }

      await prisma.assignment.upsert({
        where: { categoryId_month: { categoryId, month: toDbMonth(step.month) } },
        create: {
          userId: USER,
          budgetId,
          categoryId,
          month: toDbMonth(step.month),
          amount: step.amount,
        },
        update: { amount: step.amount },
      });

      return;
    }

    const spentOn = step.kind === 'income' ? null : (categoryIds[step.category] ?? null);
    if (spentOn !== null) {
      const target = await prisma.category.findUniqueOrThrow({ where: { id: spentOn } });
      if (target.hiddenAt !== null) {
        return;
      }
    }

    await prisma.transaction.create({
      data: {
        userId: USER,
        budgetId,
        accountId,
        date: toDbDate(step.date),
        amount: step.kind === 'income' ? step.amount : -step.amount,
        type: step.kind === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
        categoryId: spentOn,
      },
    });
  };

  const balances = async (): Promise<bigint> => {
    const rows = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: { userId: USER, budgetId },
      _sum: { amount: true },
    });

    return rows.reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);
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

    await prisma.transaction.deleteMany({ where: owned });
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });

    const budget = await prisma.budget.create({
      data: {
        userId: USER,
        name: 'Инвариант',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
      },
    });
    budgetId = budget.id;

    const account = await prisma.account.create({
      data: { userId: USER, budgetId, name: 'Счёт', type: 'CASH' },
    });
    accountId = account.id;

    const group = await prisma.categoryGroup.create({
      data: { userId: USER, budgetId, name: 'Группа', sortOrder: 0 },
    });

    categoryIds = [];
    for (let index = 0; index < CATEGORIES; index += 1) {
      const category = await prisma.category.create({
        data: {
          userId: USER,
          budgetId,
          groupId: group.id,
          name: `Категория ${index}`,
          sortOrder: index,
        },
      });
      categoryIds.push(category.id);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await clearMoney();
      await prisma.category.deleteMany({ where: owned });
      await prisma.categoryGroup.deleteMany({ where: owned });
      await prisma.account.deleteMany({ where: owned });
      await prisma.idempotencyKey.deleteMany({ where: owned });
      await prisma.budget.deleteMany({ where: owned });
      await prisma.userSettings.deleteMany({ where: owned });
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

  it('holds after every operation: ready to assign plus every available equals every balance', async () => {
    await fc.assert(
      fc
        .asyncProperty(fc.array(operation(), { minLength: 1, maxLength: 8 }), async (steps) => {
          for (const step of steps) {
            await apply(step);

            const held = await balances();

            const withHidden = await allTimeView();
            const all = withHidden.groups
              .flatMap((group) => group.categories)
              .reduce((total, category) => total + BigInt(category.available), 0n);

            expect(BigInt(withHidden.readyToAssign) + all).toBe(held);

            const shown = await allTimeView(false);
            const visible = shown.groups
              .flatMap((group) => group.categories)
              .reduce((total, category) => total + BigInt(category.available), 0n);

            expect(BigInt(shown.readyToAssign) + visible).toBe(held);
          }
        })
        .beforeEach(clearMoney),
      { numRuns: 50 },
    );

    expect(movesLanded).toBeGreaterThan(0);
    expect(hidesLanded).toBeGreaterThan(0);
  }, 180_000);
});
