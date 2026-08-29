import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { toDbMonth } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoMoveScoping';

const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;

const MONTH = '2026-02';

describe('moves across tenants', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const move = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/moves')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedOwner = async (userId: string, name: string) => {
    const budget = await prisma.budget.create({
      data: {
        userId,
        name,
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
      },
    });
    const group = await prisma.categoryGroup.create({
      data: { userId, budgetId: budget.id, name: 'Дом', sortOrder: 0 },
    });
    const category = await prisma.category.create({
      data: { userId, budgetId: budget.id, groupId: group.id, name: 'Еда', sortOrder: 0 },
    });

    return { userId, budget, category };
  };

  const assignmentsOf = (userId: string) => prisma.assignment.findMany({ where: { userId } });

  const toCategory = (categoryId: string) => ({ kind: 'CATEGORY', categoryId });
  const readyToAssign = { kind: 'READY_TO_ASSIGN' };

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

  it("does not find another user's category as a side, and leaves their month alone", async () => {
    const a = await seedOwner(USER_A, 'A');
    const b = await seedOwner(USER_B, 'B');

    await prisma.assignment.create({
      data: {
        userId: USER_B,
        budgetId: b.budget.id,
        categoryId: b.category.id,
        month: toDbMonth(MONTH),
        amount: 5_000n,
      },
    });

    await move(USER_A, {
      month: MONTH,
      amount: '1000',
      from: readyToAssign,
      to: toCategory(b.category.id),
      idempotencyKey: 'reach-across',
    }).expect(400);

    expect(await assignmentsOf(USER_A)).toHaveLength(0);

    const untouched = await assignmentsOf(USER_B);
    expect(untouched).toHaveLength(1);
    expect(untouched[0]?.amount).toBe(5_000n);
    expect(a.category.id).not.toBe(b.category.id);
  });

  it("refuses to drain another user's category into the caller own", async () => {
    const a = await seedOwner(USER_A, 'A');
    const b = await seedOwner(USER_B, 'B');

    await move(USER_A, {
      month: MONTH,
      amount: '1000',
      from: toCategory(b.category.id),
      to: toCategory(a.category.id),
      idempotencyKey: 'drain-across',
    }).expect(400);

    expect(await assignmentsOf(USER_A)).toHaveLength(0);
    expect(await assignmentsOf(USER_B)).toHaveLength(0);
  });

  it('performs each caller own move when both hold the same key', async () => {
    const a = await seedOwner(USER_A, 'A');
    const b = await seedOwner(USER_B, 'B');

    const bodyFor = (categoryId: string): Record<string, unknown> => ({
      month: MONTH,
      amount: '4000',
      from: readyToAssign,
      to: toCategory(categoryId),
      idempotencyKey: 'form-opened-once',
    });

    await move(USER_A, bodyFor(a.category.id)).expect(201);
    await move(USER_B, bodyFor(b.category.id)).expect(201);

    for (const [userId, category] of [
      [USER_A, a.category],
      [USER_B, b.category],
    ] as const) {
      const rows = await assignmentsOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.categoryId).toBe(category.id);
      expect(rows[0]?.amount).toBe(4_000n);
    }
  });

  it('writes the row into the caller own budget while the other user holds one too', async () => {
    const a = await seedOwner(USER_A, 'A');
    await seedOwner(USER_B, 'B');

    await move(USER_A, {
      month: MONTH,
      amount: '2500',
      from: readyToAssign,
      to: toCategory(a.category.id),
      idempotencyKey: 'own-budget',
    }).expect(201);

    const rows = await assignmentsOf(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.budgetId).toBe(a.budget.id);
    expect(await assignmentsOf(USER_B)).toHaveLength(0);
  });
});
