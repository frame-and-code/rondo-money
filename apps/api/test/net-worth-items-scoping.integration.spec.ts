import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoNetWorthScoping';

const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;

type Kind = 'asset' | 'liability';

interface Entity {
  kind: Kind;
  path: string;
  unknown: string;
}

const ENTITIES: Entity[] = [
  { kind: 'asset', path: '/assets', unknown: 'UNKNOWN_ASSET' },
  { kind: 'liability', path: '/liabilities', unknown: 'UNKNOWN_LIABILITY' },
];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const changing = { name: 'Мой теперь', amount: '1', idempotencyKey: 'b-opened-the-form' };

const deleting = { idempotencyKey: 'b-opened-the-confirmation' };

interface Stored {
  id: string;
  userId: string;
  budgetId: string;
  name: string;
  amount: bigint;
}

describe('assets and liabilities across tenants', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const create = (userId: string, path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post(path)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const change = (userId: string, path: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .patch(`${path}/${id}`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const remove = (userId: string, path: string, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post(`${path}/${id}/delete`)
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const namesListed = async (userId: string, path: string): Promise<unknown[]> => {
    const response = await request(app.getHttpServer() as Server)
      .get(path)
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

    expect(response.status).toBe(200);

    return (asRecord(response.body)['items'] as unknown[]).map((item) => asRecord(item)['name']);
  };

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.asset.deleteMany({ where: owned });
    await prisma.liability.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedBudget = (userId: string, name: string, active = true) =>
    prisma.budget.create({
      data: {
        userId,
        name,
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active,
      },
    });

  const seedItem = (
    kind: Kind,
    userId: string,
    budgetId: string,
    name: string,
  ): Promise<Stored> => {
    const data = { userId, budgetId, name, amount: 45_000_000n };

    return kind === 'asset' ? prisma.asset.create({ data }) : prisma.liability.create({ data });
  };

  const storedOf = (kind: Kind, id: string): Promise<Stored | null> =>
    kind === 'asset'
      ? prisma.asset.findFirst({ where: { id } })
      : prisma.liability.findFirst({ where: { id } });

  const heldIn = (kind: Kind, userId: string, budgetId: string): Promise<number> =>
    kind === 'asset'
      ? prisma.asset.count({ where: { userId, budgetId } })
      : prisma.liability.count({ where: { userId, budgetId } });

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

  describe.each(ENTITIES)('$path', ({ kind, path, unknown }) => {
    it('shows one user nothing of what another user wrote down', async () => {
      const budgetA = await seedBudget(USER_A, 'A');
      const budgetB = await seedBudget(USER_B, 'B');

      await seedItem(kind, USER_A, budgetA.id, 'Квартира A');
      await seedItem(kind, USER_B, budgetB.id, 'Гараж B');

      await expect(namesListed(USER_A, path)).resolves.toEqual(['Квартира A']);
      await expect(namesListed(USER_B, path)).resolves.toEqual(['Гараж B']);
    });

    it('refuses to change one belonging to another user, and leaves it untouched', async () => {
      const budgetA = await seedBudget(USER_A, 'A');
      await seedBudget(USER_B, 'B');

      const itemA = await seedItem(kind, USER_A, budgetA.id, 'Квартира A');

      const response = await change(USER_B, path, itemA.id, changing);

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe(unknown);
      await expect(storedOf(kind, itemA.id)).resolves.toMatchObject({
        userId: USER_A,
        name: 'Квартира A',
        amount: 45_000_000n,
      });
    });

    it('refuses to delete one belonging to another user, and leaves it where it was', async () => {
      const budgetA = await seedBudget(USER_A, 'A');
      await seedBudget(USER_B, 'B');

      const itemA = await seedItem(kind, USER_A, budgetA.id, 'Квартира A');

      const response = await remove(USER_B, path, itemA.id, deleting);

      expect(response.status).toBe(400);
      expect(asRecord(response.body)['reason']).toBe(unknown);
      await expect(storedOf(kind, itemA.id)).resolves.toMatchObject({ userId: USER_A });
    });

    it('keeps a second budget of the same caller out of the list, the change and the delete', async () => {
      const retired = await seedBudget(USER_A, 'Прежний', false);
      const active = await seedBudget(USER_A, 'Текущий');

      const old = await seedItem(kind, USER_A, retired.id, 'Из прежнего');
      await seedItem(kind, USER_A, active.id, 'Из текущего');

      const changed = await change(USER_A, path, old.id, changing);
      const removed = await remove(USER_A, path, old.id, deleting);

      await expect(namesListed(USER_A, path)).resolves.toEqual(['Из текущего']);
      expect(changed.status).toBe(400);
      expect(asRecord(changed.body)['reason']).toBe(unknown);
      expect(removed.status).toBe(400);
      expect(asRecord(removed.body)['reason']).toBe(unknown);
      await expect(storedOf(kind, old.id)).resolves.toMatchObject({
        budgetId: retired.id,
        name: 'Из прежнего',
      });
    });

    it('writes into the caller own budget while another user has one too', async () => {
      const budgetA = await seedBudget(USER_A, 'A');
      const budgetB = await seedBudget(USER_B, 'B');

      const response = await create(USER_B, path, {
        name: 'Гараж B',
        amount: '100',
        idempotencyKey: 'b-opened-a-form',
      });

      expect(response.status).toBe(201);
      await expect(heldIn(kind, USER_B, budgetB.id)).resolves.toBe(1);
      await expect(heldIn(kind, USER_A, budgetA.id)).resolves.toBe(0);
    });
  });

  it('leaves a second user holding the same idempotency key alone', async () => {
    const budgetA = await seedBudget(USER_A, 'A');
    const budgetB = await seedBudget(USER_B, 'B');

    const shared = { name: 'Квартира', amount: '100', idempotencyKey: 'both-opened-a-form' };

    const first = await create(USER_A, '/assets', shared);
    const second = await create(USER_B, '/assets', shared);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(asRecord(second.body)['id']).not.toBe(asRecord(first.body)['id']);
    await expect(heldIn('asset', USER_A, budgetA.id)).resolves.toBe(1);
    await expect(heldIn('asset', USER_B, budgetB.id)).resolves.toBe(1);
  });
});
