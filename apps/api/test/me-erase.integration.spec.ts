import { randomUUID } from 'node:crypto';
import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { parseCalendarDate, parseCalendarMonth, toDbDate, toDbMonth } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';
import { heldBy } from './owned-rows';

const USER_PREFIX = 'user_2rondoErases';

const USER_WHOLE = `${USER_PREFIX}Whole`;
const USER_BARE = `${USER_PREFIX}Bare`;
const USER_AFTER = `${USER_PREFIX}After`;
const USER_TWICE = `${USER_PREFIX}Twice`;
const USER_RACE = `${USER_PREFIX}Race`;
const USER_REFUSED = `${USER_PREFIX}Refused`;
const USER_NEIGHBOUR = `${USER_PREFIX}Neighbour`;
const USER_SWEEPS = `${USER_PREFIX}Sweeps`;
const USER_SHARES = `${USER_PREFIX}Shares`;
const USER_CLEARS = `${USER_PREFIX}Clears`;

const ZONE = 'Europe/Warsaw';

const SHARED_KEY = 'the-two-of-us-opened-a-dialog';

describe('POST /me/erase (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const erase = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/me/erase')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.assignment.deleteMany({ where: owned });
    await prisma.categoryTarget.deleteMany({ where: owned });
    await prisma.categoryPaidMonth.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedBudget = async (userId: string, name: string, active: boolean) =>
    prisma.budget.create({
      data: { userId, name, currency: 'PLN', minorDigits: 2, timezone: ZONE, active },
    });

  const seedEverything = async (userId: string): Promise<void> => {
    await prisma.userSettings.create({ data: { userId, language: 'RU' } });

    const retired = await seedBudget(userId, 'Retired', false);
    const budget = await seedBudget(userId, 'Household', true);

    await prisma.account.create({
      data: { userId, budgetId: retired.id, name: 'Shoebox', type: 'CASH' },
    });

    const group = await prisma.categoryGroup.create({
      data: { userId, budgetId: budget.id, name: 'Bills', sortOrder: 0 },
    });
    const category = await prisma.category.create({
      data: { userId, budgetId: budget.id, groupId: group.id, name: 'Rent', sortOrder: 0 },
    });
    const wallet = await prisma.account.create({
      data: { userId, budgetId: budget.id, name: 'Wallet', type: 'CASH' },
    });
    const card = await prisma.account.create({
      data: { userId, budgetId: budget.id, name: 'Card', type: 'DEBIT' },
    });

    const date = toDbDate(parseCalendarDate('2026-02-10'));
    const month = toDbMonth(parseCalendarMonth('2026-02'));
    const transferId = randomUUID();

    await prisma.transaction.create({
      data: {
        userId,
        budgetId: budget.id,
        accountId: wallet.id,
        categoryId: category.id,
        date,
        amount: -120_000n,
        type: 'EXPENSE',
      },
    });
    await prisma.transaction.create({
      data: {
        userId,
        budgetId: budget.id,
        accountId: wallet.id,
        date,
        amount: -50_000n,
        type: 'TRANSFER',
        transferId,
      },
    });
    await prisma.transaction.create({
      data: {
        userId,
        budgetId: budget.id,
        accountId: card.id,
        date,
        amount: 50_000n,
        type: 'TRANSFER',
        transferId,
      },
    });
    await prisma.assignment.create({
      data: { userId, budgetId: budget.id, categoryId: category.id, month, amount: 200_000n },
    });
    await prisma.categoryTarget.create({
      data: {
        userId,
        budgetId: budget.id,
        categoryId: category.id,
        kind: 'CONTRIBUTE',
        amount: 200_000n,
        startMonth: month,
      },
    });
    await prisma.categoryPaidMonth.create({
      data: { userId, budgetId: budget.id, categoryId: category.id, month },
    });
  };

  const seedKey = (userId: string, value: string) =>
    prisma.idempotencyKey.create({
      data: { userId, key: value, requestFingerprint: 'a'.repeat(64), result: { done: true } },
    });

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

  it('leaves the caller holding nothing but the key this request claimed', async () => {
    await seedEverything(USER_WHOLE);
    await seedKey(USER_WHOLE, 'a-move-last-week');
    await seedKey(USER_WHOLE, 'a-record-yesterday');

    const response = await erase(USER_WHOLE, { idempotencyKey: 'erase-opened-once' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_WHOLE });
    await expect(heldBy(prisma, USER_WHOLE)).resolves.toEqual([['IdempotencyKey', 1]]);
  });

  it('erases the budget that was not the active one, which a scoped query would have missed', async () => {
    await seedEverything(USER_WHOLE);

    await erase(USER_WHOLE, { idempotencyKey: 'erase-opened-once' });

    await expect(prisma.budget.count({ where: { userId: USER_WHOLE } })).resolves.toBe(0);
    await expect(
      prisma.account.count({ where: { userId: USER_WHOLE, name: 'Shoebox' } }),
    ).resolves.toBe(0);
  });

  it('spares exactly the running key, and stores the answer it gave on it', async () => {
    await seedEverything(USER_WHOLE);
    await seedKey(USER_WHOLE, 'a-move-last-week');

    const response = await erase(USER_WHOLE, { idempotencyKey: 'erase-opened-once' });

    const left = await prisma.idempotencyKey.findMany({ where: { userId: USER_WHOLE } });
    expect(left).toHaveLength(1);
    expect(left[0]?.key).toBe('erase-opened-once');
    expect(left[0]?.result).toEqual(response.body);
  });

  it('erases a caller who never created a budget at all', async () => {
    const response = await erase(USER_BARE, { idempotencyKey: 'nothing-to-lose' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_BARE });
  });

  it('leaves the caller able to create a budget again', async () => {
    await seedEverything(USER_AFTER);
    const erased = await erase(USER_AFTER, { idempotencyKey: 'erase-opened-once' });
    expect(erased.status).toBe(200);

    const created = await request(app.getHttpServer() as Server)
      .post('/budgets')
      .set('Authorization', `Bearer ${tokenFor(USER_AFTER)}`)
      .send({
        name: 'Second life',
        currency: 'PLN',
        timezone: ZONE,
        language: 'ru',
        withDefaultCategories: true,
        idempotencyKey: 'a-fresh-start',
      });

    expect(created.status).toBe(201);
    await expect(
      prisma.budget.count({ where: { userId: USER_AFTER, active: true } }),
    ).resolves.toBe(1);
  });

  it('answers a repeat with the first result without erasing what was written since', async () => {
    await seedEverything(USER_TWICE);
    const first = await erase(USER_TWICE, { idempotencyKey: 'erase-opened-once' });
    expect(first.status).toBe(200);
    const rebuilt = await seedBudget(USER_TWICE, 'Rebuilt', true);

    const repeat = await erase(USER_TWICE, { idempotencyKey: 'erase-opened-once' });

    expect(repeat.status).toBe(200);
    expect(repeat.body).toEqual(first.body);
    await expect(prisma.budget.findUnique({ where: { id: rebuilt.id } })).resolves.not.toBeNull();
  });

  it('applies one key once when two requests carry it side by side', async () => {
    await seedEverything(USER_RACE);

    const [first, second] = await Promise.all([
      erase(USER_RACE, { idempotencyKey: 'pressed-twice' }),
      erase(USER_RACE, { idempotencyKey: 'pressed-twice' }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body).toEqual(second.body);
    await expect(prisma.idempotencyKey.count({ where: { userId: USER_RACE } })).resolves.toBe(1);
  });

  it.each([
    ['no key at all', {}],
    ['an empty key', { idempotencyKey: '' }],
    ['a key of nothing but spaces', { idempotencyKey: '   ' }],
    ['a field the endpoint never declared', { idempotencyKey: 'fine', confirm: 'DELETE' }],
  ])('refuses %s, and erases nothing', async (_case, body) => {
    await seedEverything(USER_REFUSED);

    const response = await erase(USER_REFUSED, body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    await expect(prisma.budget.count({ where: { userId: USER_REFUSED } })).resolves.toBe(2);
  });

  it('answers an anonymous caller with 401 and erases nothing', async () => {
    await seedEverything(USER_REFUSED);

    const response = await request(app.getHttpServer() as Server)
      .post('/me/erase')
      .send({ idempotencyKey: 'anonymous' });

    expect(response.status).toBe(401);
    await expect(prisma.budget.count({ where: { userId: USER_REFUSED } })).resolves.toBe(2);
  });

  it("never touches another caller's rows", async () => {
    await seedEverything(USER_NEIGHBOUR);
    await seedKey(USER_NEIGHBOUR, 'a-move-last-week');
    await seedEverything(USER_SWEEPS);
    const before = await heldBy(prisma, USER_NEIGHBOUR);

    const response = await erase(USER_SWEEPS, { idempotencyKey: 'erase-opened-once' });

    expect(response.status).toBe(200);
    await expect(heldBy(prisma, USER_SWEEPS)).resolves.toEqual([['IdempotencyKey', 1]]);
    await expect(heldBy(prisma, USER_NEIGHBOUR)).resolves.toEqual(before);
  });

  it('leaves a second caller holding the very same key string untouched', async () => {
    await seedKey(USER_SHARES, SHARED_KEY);
    await seedEverything(USER_CLEARS);
    await seedKey(USER_CLEARS, SHARED_KEY);

    const response = await erase(USER_CLEARS, { idempotencyKey: 'erase-opened-once' });

    expect(response.status).toBe(200);
    const kept = await prisma.idempotencyKey.findMany({ where: { userId: USER_SHARES } });
    expect(kept).toHaveLength(1);
    expect(kept[0]?.key).toBe(SHARED_KEY);
  });
});
