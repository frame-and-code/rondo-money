import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  calendarDateOf,
  monthOf,
  parseCalendarDate,
  toDbDate,
  todayIn,
  type CalendarDate,
} from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { generateOpenApiDocument } from '@/openapi/generate';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoOwnedOwed';

const USER_FIRST = `${USER_PREFIX}First`;
const USER_UNDATED = `${USER_PREFIX}Undated`;
const USER_REJECT = `${USER_PREFIX}Reject`;
const USER_NAMED = `${USER_PREFIX}Named`;
const USER_EAST = `${USER_PREFIX}East`;
const USER_WEST = `${USER_PREFIX}West`;
const USER_NOBUDGET = `${USER_PREFIX}NoBudget`;
const USER_REPEAT = `${USER_PREFIX}Repeat`;
const USER_CHANGED = `${USER_PREFIX}Changed`;
const USER_MOVED = `${USER_PREFIX}Moved`;
const USER_RACE = `${USER_PREFIX}Race`;
const USER_RETRY = `${USER_PREFIX}Retry`;
const USER_BELOW = `${USER_PREFIX}Below`;
const USER_ORDER = `${USER_PREFIX}Order`;
const USER_EDITS = `${USER_PREFIX}Edits`;
const USER_GONE = `${USER_PREFIX}Gone`;
const USER_POOL = `${USER_PREFIX}Pool`;

const ZONE = 'Europe/Warsaw';

const DAY_MS = 86_400_000;

const ABSENT = '0199c1a8-9ecf-71c7-a617-c575df073999';

type Kind = 'asset' | 'liability';

interface Entity {
  kind: Kind;
  other: Kind;
  path: string;
  unknown: string;
}

const ENTITIES: Entity[] = [
  {
    kind: 'asset',
    other: 'liability',
    path: '/assets',
    unknown: 'UNKNOWN_ASSET',
  },
  {
    kind: 'liability',
    other: 'asset',
    path: '/liabilities',
    unknown: 'UNKNOWN_LIABILITY',
  },
];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const without = (record: Record<string, unknown>, field: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== field));

const twoDaysAfter = (date: CalendarDate): CalendarDate =>
  calendarDateOf(new Date(toDbDate(date).getTime() + 2 * DAY_MS));

const writing = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Квартира',
  amount: '45000000',
  date: '2024-03-15',
  idempotencyKey: 'form-opened-once',
  ...over,
});

interface Stored {
  id: string;
  userId: string;
  budgetId: string;
  name: string;
  amount: bigint;
  date: Date | null;
}

describe('assets and liabilities (integration)', () => {
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

  const list = (userId: string, path: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

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

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.asset.deleteMany({ where: owned });
    await prisma.liability.deleteMany({ where: owned });
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const seedBudget = (userId: string, over: Record<string, unknown> = {}) =>
    prisma.budget.create({
      data: {
        userId,
        name: 'Основной',
        currency: 'PLN',
        minorDigits: 2,
        timezone: ZONE,
        active: true,
        ...over,
      },
    });

  const leaveFor = async (userId: string, budgetId: string) => {
    await prisma.budget.update({ where: { id: budgetId }, data: { active: false } });

    return seedBudget(userId, { name: 'Второй' });
  };

  const seedItem = (
    kind: Kind,
    userId: string,
    budgetId: string,
    over: { name?: string; amount?: bigint; date?: Date | null; createdAt?: Date } = {},
  ): Promise<Stored> => {
    const data = {
      userId,
      budgetId,
      name: 'Квартира',
      amount: 45_000_000n,
      date: toDbDate(parseCalendarDate('2024-03-15')),
      ...over,
    };

    return kind === 'asset' ? prisma.asset.create({ data }) : prisma.liability.create({ data });
  };

  const countOf = (kind: Kind, userId: string, budgetId?: string): Promise<number> => {
    const where = { userId, ...(budgetId ? { budgetId } : {}) };

    return kind === 'asset' ? prisma.asset.count({ where }) : prisma.liability.count({ where });
  };

  const storedOf = (kind: Kind, id: string): Promise<Stored | null> =>
    kind === 'asset'
      ? prisma.asset.findFirst({ where: { id } })
      : prisma.liability.findFirst({ where: { id } });

  const stampOf = async (kind: Kind, id: string): Promise<Date> => {
    const row =
      kind === 'asset'
        ? await prisma.asset.findFirstOrThrow({ where: { id } })
        : await prisma.liability.findFirstOrThrow({ where: { id } });

    return row.updatedAt;
  };

  const keysOf = (userId: string): Promise<number> =>
    prisma.idempotencyKey.count({ where: { userId } });

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

  describe.each(ENTITIES)('$path', ({ kind, other, path, unknown }) => {
    describe('writing one down', () => {
      it('stores the name, the amount and the day, and answers with those and the id alone', async () => {
        const budget = await seedBudget(USER_FIRST);

        const response = await create(USER_FIRST, path, writing());
        const document = await generateOpenApiDocument();
        const published = document.components?.schemas?.['NetWorthItemResponse'];
        const fields =
          published && 'properties' in published ? Object.keys(published.properties ?? {}) : [];

        expect(response.status).toBe(201);

        const item = asRecord(response.body);
        expect(fields.sort()).toEqual(['amount', 'date', 'id', 'name']);
        expect(Object.keys(item).sort()).toEqual(fields.sort());
        expect(item).toMatchObject({ name: 'Квартира', amount: '45000000', date: '2024-03-15' });

        const stored = await storedOf(kind, String(item['id']));
        expect(stored).toMatchObject({
          userId: USER_FIRST,
          budgetId: budget.id,
          name: 'Квартира',
          amount: 45_000_000n,
          date: toDbDate(parseCalendarDate('2024-03-15')),
        });
        await expect(countOf(other, USER_FIRST)).resolves.toBe(0);
      });

      it('takes an amount of nothing, because a thing can be worth nothing yet', async () => {
        await seedBudget(USER_FIRST);

        const response = await create(USER_FIRST, path, writing({ amount: '0' }));

        expect(response.status).toBe(201);
        expect(asRecord(response.body)['amount']).toBe('0');
      });

      it('stores no day when none was given, and says so with a null', async () => {
        await seedBudget(USER_UNDATED);

        const response = await create(USER_UNDATED, path, without(writing(), 'date'));

        expect(response.status).toBe(201);

        const item = asRecord(response.body);
        expect(item['date']).toBeNull();

        const stored = await storedOf(kind, String(item['id']));
        expect(stored?.date).toBeNull();
      });

      it.each([
        ['an amount below zero', { amount: '-1' }],
        ['a decimal amount', { amount: '100.50' }],
        ['an amount sent as a number', { amount: 100 }],
        ['a name of nothing at all', { name: '' }],
        ['a name of nothing but spaces', { name: '   ' }],
        ['a name of sixty-one characters', { name: 'я'.repeat(61) }],
        ['a field the body does not declare', { owner: 'someone else' }],
        ['a day the calendar does not hold', { date: '2026-02-30' }],
      ])('refuses %s and writes nothing', async (_what, over) => {
        await seedBudget(USER_REJECT);

        const response = await create(USER_REJECT, path, writing(over));

        expect(response.status).toBe(400);
        await expect(countOf(kind, USER_REJECT)).resolves.toBe(0);
        await expect(keysOf(USER_REJECT)).resolves.toBe(0);
      });

      it('trims the edges off the name it stores, and takes one of sixty characters', async () => {
        await seedBudget(USER_NAMED);

        const trimmed = await create(USER_NAMED, path, writing({ name: '  Квартира  ' }));
        const longest = await create(
          USER_NAMED,
          path,
          writing({ name: 'я'.repeat(60), idempotencyKey: 'another-form' }),
        );

        expect(trimmed.status).toBe(201);
        expect(asRecord(trimmed.body)['name']).toBe('Квартира');
        await expect(storedOf(kind, String(asRecord(trimmed.body)['id']))).resolves.toMatchObject({
          name: 'Квартира',
        });
        expect(longest.status).toBe(201);
      });

      it('refuses a day after today by the budget zone, not by the server clock', async () => {
        await seedBudget(USER_EAST, { timezone: 'Pacific/Kiritimati' });
        await seedBudget(USER_WEST, { timezone: 'Pacific/Niue' });

        const eastToday = todayIn('Pacific/Kiritimati');

        const east = await create(USER_EAST, path, writing({ date: eastToday }));
        const west = await create(USER_WEST, path, writing({ date: eastToday }));

        expect(east.status).toBe(201);
        expect(west.status).toBe(400);
        expect(asRecord(west.body)['reason']).toBe('DATE_IN_FUTURE');
        await expect(countOf(kind, USER_WEST)).resolves.toBe(0);
      });

      it('refuses with a reason when the caller has no active budget, rather than failing at 500', async () => {
        const response = await create(USER_NOBUDGET, path, writing());

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
        await expect(countOf(kind, USER_NOBUDGET)).resolves.toBe(0);
        await expect(keysOf(USER_NOBUDGET)).resolves.toBe(0);
      });

      it('answers a repeated key with the one it already wrote', async () => {
        await seedBudget(USER_REPEAT);

        const first = await create(USER_REPEAT, path, writing());
        const second = await create(USER_REPEAT, path, writing());

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body).toEqual(first.body);
        await expect(countOf(kind, USER_REPEAT)).resolves.toBe(1);
      });

      it('refuses a repeated key carrying a different intent', async () => {
        await seedBudget(USER_CHANGED);

        const first = await create(USER_CHANGED, path, writing());
        const second = await create(USER_CHANGED, path, writing({ amount: '1' }));

        expect(first.status).toBe(201);
        expect(second.status).toBe(409);
        await expect(countOf(kind, USER_CHANGED)).resolves.toBe(1);
      });

      it('refuses a repeated key aimed at a budget the caller has since left', async () => {
        const first = await seedBudget(USER_MOVED);
        const written = await create(USER_MOVED, path, writing());

        const second = await leaveFor(USER_MOVED, first.id);
        const repeat = await create(USER_MOVED, path, writing());

        expect(written.status).toBe(201);
        expect(repeat.status).toBe(409);
        await expect(countOf(kind, USER_MOVED, second.id)).resolves.toBe(0);
      });

      it('lets the same key through once the refused day is corrected', async () => {
        await seedBudget(USER_RETRY);

        const ahead = twoDaysAfter(todayIn(ZONE));
        const refused = await create(USER_RETRY, path, writing({ date: ahead }));
        const retried = await create(USER_RETRY, path, writing());

        expect(refused.status).toBe(400);
        expect(asRecord(refused.body)['reason']).toBe('DATE_IN_FUTURE');
        expect(retried.status).toBe(201);
        await expect(countOf(kind, USER_RETRY)).resolves.toBe(1);
      });

      it('is refused by the database below zero, whatever wrote it', async () => {
        const budget = await seedBudget(USER_BELOW);

        await expect(seedItem(kind, USER_BELOW, budget.id, { amount: -1n })).rejects.toThrow(
          new RegExp(`${kind}_amount_is_not_negative`),
        );
      });
    });

    describe('reading them back', () => {
      it('lists the active budget oldest first, with amounts as strings and days as dates', async () => {
        const budget = await seedBudget(USER_ORDER);

        await seedItem(kind, USER_ORDER, budget.id, {
          name: 'Автомобиль',
          date: null,
          createdAt: new Date('2026-01-02T10:00:00Z'),
        });
        await seedItem(kind, USER_ORDER, budget.id, {
          name: 'Яхта',
          amount: 9_007_199_254_740_993n,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        });
        await seedItem(other, USER_ORDER, budget.id, { name: 'Из другой секции' });

        const response = await list(USER_ORDER, path);
        const document = await generateOpenApiDocument();
        const published = document.components?.schemas?.['NetWorthItemsResponse'];

        expect(response.status).toBe(200);
        expect(
          published && 'properties' in published ? Object.keys(published.properties ?? {}) : [],
        ).toEqual(['items']);

        const items = (asRecord(response.body)['items'] as unknown[]).map(asRecord);
        expect(items.map((item) => without(item, 'id'))).toEqual([
          { name: 'Яхта', amount: '9007199254740993', date: '2024-03-15' },
          { name: 'Автомобиль', amount: '45000000', date: null },
        ]);
      });

      it('answers a budget holding none with an empty list', async () => {
        await seedBudget(USER_ORDER);

        const response = await list(USER_ORDER, path);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ items: [] });
      });

      it('refuses with a reason when the caller has no active budget', async () => {
        const response = await list(USER_NOBUDGET, path);

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
      });
    });

    describe('changing one', () => {
      const changing = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
        name: 'Дом',
        amount: '50000000',
        date: '2025-06-01',
        idempotencyKey: 'edit-form-opened-once',
        ...over,
      });

      it('changes the name, the amount and the day in one request', async () => {
        const budget = await seedBudget(USER_EDITS);
        const item = await seedItem(kind, USER_EDITS, budget.id, {
          createdAt: new Date('2026-01-01T10:00:00Z'),
        });
        const stamped = (await stampOf(kind, item.id)).getTime();

        const response = await change(USER_EDITS, path, item.id, changing());

        expect(response.status).toBe(200);
        await expect(stampOf(kind, item.id).then((at) => at.getTime())).resolves.toBeGreaterThan(
          stamped,
        );
        expect(response.body).toEqual({
          id: item.id,
          name: 'Дом',
          amount: '50000000',
          date: '2025-06-01',
        });
        await expect(storedOf(kind, item.id)).resolves.toMatchObject({
          name: 'Дом',
          amount: 50_000_000n,
          date: toDbDate(parseCalendarDate('2025-06-01')),
        });
      });

      it('takes the day off when the body carries none, because the body is the whole record', async () => {
        const budget = await seedBudget(USER_EDITS);
        const item = await seedItem(kind, USER_EDITS, budget.id);

        const response = await change(USER_EDITS, path, item.id, without(changing(), 'date'));

        expect(response.status).toBe(200);
        expect(asRecord(response.body)['date']).toBeNull();
        await expect(storedOf(kind, item.id)).resolves.toMatchObject({ name: 'Дом', date: null });
      });

      it.each([
        ['an amount below zero', () => ({ amount: '-1' }), undefined],
        ['a name of nothing but spaces', () => ({ name: '   ' }), undefined],
        ['a field the body does not declare', () => ({ owner: 'someone else' }), undefined],
        ['a day after today', () => ({ date: twoDaysAfter(todayIn(ZONE)) }), 'DATE_IN_FUTURE'],
      ])('refuses %s and leaves the row as it was', async (_what, over, reason) => {
        const budget = await seedBudget(USER_REJECT);
        const item = await seedItem(kind, USER_REJECT, budget.id);

        const response = await change(USER_REJECT, path, item.id, changing(over()));

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe(reason);
        await expect(storedOf(kind, item.id)).resolves.toMatchObject({
          name: 'Квартира',
          amount: 45_000_000n,
          date: toDbDate(parseCalendarDate('2024-03-15')),
        });
        await expect(keysOf(USER_REJECT)).resolves.toBe(0);
      });

      it('trims the edges off the name it stores', async () => {
        const budget = await seedBudget(USER_NAMED);
        const item = await seedItem(kind, USER_NAMED, budget.id);

        const response = await change(USER_NAMED, path, item.id, changing({ name: '  Дом  ' }));

        expect(response.status).toBe(200);
        await expect(storedOf(kind, item.id)).resolves.toMatchObject({ name: 'Дом' });
      });

      it('answers a repeated key with what it already wrote, and writes nothing again', async () => {
        const budget = await seedBudget(USER_REPEAT);
        const item = await seedItem(kind, USER_REPEAT, budget.id);

        const first = await change(USER_REPEAT, path, item.id, changing());
        await (kind === 'asset'
          ? prisma.asset.update({ where: { id: item.id }, data: { name: 'Переименовано позже' } })
          : prisma.liability.update({
              where: { id: item.id },
              data: { name: 'Переименовано позже' },
            }));
        const second = await change(USER_REPEAT, path, item.id, changing());

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body).toEqual(first.body);
        await expect(storedOf(kind, item.id)).resolves.toMatchObject({
          name: 'Переименовано позже',
        });
        await expect(keysOf(USER_REPEAT)).resolves.toBe(1);
      });

      it('refuses a repeated key carrying a different change', async () => {
        const budget = await seedBudget(USER_CHANGED);
        const item = await seedItem(kind, USER_CHANGED, budget.id);

        await change(USER_CHANGED, path, item.id, changing());
        const second = await change(USER_CHANGED, path, item.id, changing({ name: 'Дача' }));

        expect(second.status).toBe(409);
        await expect(storedOf(kind, item.id)).resolves.toMatchObject({ name: 'Дом' });
      });

      it('refuses a repeated key aimed at a budget the caller has since left', async () => {
        const first = await seedBudget(USER_MOVED);
        const item = await seedItem(kind, USER_MOVED, first.id);

        const written = await change(USER_MOVED, path, item.id, changing());
        await leaveFor(USER_MOVED, first.id);
        const repeat = await change(USER_MOVED, path, item.id, changing());

        expect(written.status).toBe(200);
        expect(repeat.status).toBe(409);
      });

      it('refuses an id this budget does not hold, with a reason rather than a 500', async () => {
        await seedBudget(USER_GONE);

        const response = await change(USER_GONE, path, ABSENT, changing());

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe(unknown);
        await expect(keysOf(USER_GONE)).resolves.toBe(0);
      });

      it('refuses an id that belongs to the other section, and leaves that row alone', async () => {
        const budget = await seedBudget(USER_GONE);
        const neighbour = await seedItem(other, USER_GONE, budget.id);

        const response = await change(USER_GONE, path, neighbour.id, changing());

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe(unknown);
        await expect(storedOf(other, neighbour.id)).resolves.toMatchObject({
          name: 'Квартира',
          amount: 45_000_000n,
        });
      });

      it('refuses with a reason when the caller has no active budget', async () => {
        const response = await change(USER_NOBUDGET, path, ABSENT, changing());

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
      });
    });

    describe('deleting one', () => {
      const deleting = { idempotencyKey: 'confirmation-opened-once' };

      it('removes the row rather than marking it, and answers with what it removed', async () => {
        const budget = await seedBudget(USER_GONE);
        const item = await seedItem(kind, USER_GONE, budget.id);
        const kept = await seedItem(kind, USER_GONE, budget.id, { name: 'Гараж' });

        const response = await remove(USER_GONE, path, item.id, deleting);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          id: item.id,
          name: 'Квартира',
          amount: '45000000',
          date: '2024-03-15',
        });
        await expect(storedOf(kind, item.id)).resolves.toBeNull();
        await expect(storedOf(kind, kept.id)).resolves.not.toBeNull();
      });

      it('answers a repeat under the same key with what it removed, and a new key with a refusal', async () => {
        const budget = await seedBudget(USER_REPEAT);
        const item = await seedItem(kind, USER_REPEAT, budget.id);

        const first = await remove(USER_REPEAT, path, item.id, deleting);
        const repeated = await remove(USER_REPEAT, path, item.id, deleting);
        const afresh = await remove(USER_REPEAT, path, item.id, {
          idempotencyKey: 'confirmation-opened-again',
        });

        expect(first.status).toBe(200);
        expect(repeated.status).toBe(200);
        expect(repeated.body).toEqual(first.body);
        expect(afresh.status).toBe(400);
        expect(asRecord(afresh.body)['reason']).toBe(unknown);
        await expect(keysOf(USER_REPEAT)).resolves.toBe(1);
      });

      it('refuses a repeated key aimed at a budget the caller has since left', async () => {
        const first = await seedBudget(USER_MOVED);
        const item = await seedItem(kind, USER_MOVED, first.id);

        const removed = await remove(USER_MOVED, path, item.id, deleting);
        await leaveFor(USER_MOVED, first.id);
        const repeat = await remove(USER_MOVED, path, item.id, deleting);

        expect(removed.status).toBe(200);
        expect(repeat.status).toBe(409);
      });

      it('refuses an id this budget does not hold, with a reason rather than a 500', async () => {
        await seedBudget(USER_GONE);

        const response = await remove(USER_GONE, path, ABSENT, deleting);

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe(unknown);
        await expect(keysOf(USER_GONE)).resolves.toBe(0);
      });

      it('refuses an id that belongs to the other section, and leaves that row where it was', async () => {
        const budget = await seedBudget(USER_GONE);
        const neighbour = await seedItem(other, USER_GONE, budget.id);

        const response = await remove(USER_GONE, path, neighbour.id, deleting);

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe(unknown);
        await expect(storedOf(other, neighbour.id)).resolves.not.toBeNull();
      });

      it('refuses with a reason when the caller has no active budget', async () => {
        const response = await remove(USER_NOBUDGET, path, ABSENT, deleting);

        expect(response.status).toBe(400);
        expect(asRecord(response.body)['reason']).toBe('NO_ACTIVE_BUDGET');
      });
    });
  });

  describe('two requests carrying one key', () => {
    it('write one asset, and answer both with it', async () => {
      await seedBudget(USER_RACE);

      const [first, second] = await Promise.all([
        create(USER_RACE, '/assets', writing()),
        create(USER_RACE, '/assets', writing()),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(second.body).toEqual(first.body);
      await expect(countOf('asset', USER_RACE)).resolves.toBe(1);
      await expect(keysOf(USER_RACE)).resolves.toBe(1);
    });
  });

  describe('two requests under different keys aimed at one row', () => {
    it.each(ENTITIES)(
      'remove it once on $path, and refuse the other with a reason rather than a 500',
      async ({ kind, path, unknown }) => {
        const budget = await seedBudget(USER_RACE);
        const item = await seedItem(kind, USER_RACE, budget.id);

        const answers = await Promise.all([
          remove(USER_RACE, path, item.id, { idempotencyKey: 'one-tab' }),
          remove(USER_RACE, path, item.id, { idempotencyKey: 'another-tab' }),
        ]);

        expect(answers.map((answer) => answer.status).sort()).toEqual([200, 400]);
        expect(answers.find((answer) => answer.status === 400)?.body).toMatchObject({
          reason: unknown,
        });
        await expect(storedOf(kind, item.id)).resolves.toBeNull();
        await expect(keysOf(USER_RACE)).resolves.toBe(1);
      },
    );

    it.each(ENTITIES)(
      'refuse a change on $path that lost to a delete, with a reason rather than a 500',
      async ({ kind, path, unknown }) => {
        const budget = await seedBudget(USER_RACE);
        const item = await seedItem(kind, USER_RACE, budget.id);

        const [removed, changed] = await Promise.all([
          remove(USER_RACE, path, item.id, { idempotencyKey: 'one-tab' }),
          change(USER_RACE, path, item.id, {
            name: 'Дом',
            amount: '1',
            idempotencyKey: 'another-tab',
          }),
        ]);

        expect(removed.status).toBe(200);
        expect([200, 400]).toContain(changed.status);
        if (changed.status === 400) {
          expect(asRecord(changed.body)['reason']).toBe(unknown);
        }
        await expect(storedOf(kind, item.id)).resolves.toBeNull();
      },
    );
  });

  describe('what the rest of the budget sees', () => {
    const balances = async (userId: string): Promise<unknown> => {
      const response = await request(app.getHttpServer() as Server)
        .get('/accounts')
        .set('Authorization', `Bearer ${tokenFor(userId)}`);

      expect(response.status).toBe(200);

      return response.body;
    };

    const readyToAssign = async (userId: string): Promise<string> => {
      const view = await request(app.getHttpServer() as Server)
        .get('/budget-view')
        .query({ month: monthOf(todayIn(ZONE)) })
        .set('Authorization', `Bearer ${tokenFor(userId)}`);

      expect(view.status).toBe(200);

      return String(asRecord(view.body)['readyToAssign']);
    };

    it('moves no account balance and nothing in ready to assign, because neither is money on an account', async () => {
      const budget = await seedBudget(USER_POOL);
      const wallet = await prisma.account.create({
        data: { userId: USER_POOL, budgetId: budget.id, name: 'Кошелёк', type: 'CASH' },
      });
      await prisma.transaction.create({
        data: {
          userId: USER_POOL,
          budgetId: budget.id,
          accountId: wallet.id,
          date: toDbDate(todayIn(ZONE)),
          amount: 125_050n,
          type: 'INCOME',
        },
      });

      const before = { accounts: await balances(USER_POOL), pool: await readyToAssign(USER_POOL) };

      const asset = await create(USER_POOL, '/assets', writing());
      const liability = await create(
        USER_POOL,
        '/liabilities',
        writing({ name: 'Долг другу', idempotencyKey: 'another-form' }),
      );

      expect(asset.status).toBe(201);
      expect(liability.status).toBe(201);
      expect(before.pool).toBe('125050');
      await expect(balances(USER_POOL)).resolves.toEqual(before.accounts);
      await expect(readyToAssign(USER_POOL)).resolves.toBe(before.pool);
    });
  });
});
