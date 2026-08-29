import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { minorDigits } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { defaultCategories } from '@/budgets/default-categories';
import { resolveWebOrigin } from '@/cors';
import { generateOpenApiDocument } from '@/openapi/generate';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoBudgets';

const USER_FIRST = `${USER_PREFIX}First`;
const USER_PLAIN = `${USER_PREFIX}Plain`;
const USER_YEN = `${USER_PREFIX}Yen`;
const USER_SETTLED = `${USER_PREFIX}Settled`;
const USER_SECOND = `${USER_PREFIX}Second`;
const USER_REPEAT = `${USER_PREFIX}Repeat`;
const USER_RACE = `${USER_PREFIX}Race`;
const USER_CHANGED = `${USER_PREFIX}Changed`;
const USER_EMPTY = `${USER_PREFIX}Empty`;
const USER_REJECT = `${USER_PREFIX}Reject`;
const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;

interface CreateBody {
  language: string;
  name: string;
  currency: string;
  timezone: string;
  withDefaultCategories: boolean;
  idempotencyKey: string;
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`A response body is not an object: ${JSON.stringify(value)}`);
  }

  return { ...value };
};

const creation = (over: Partial<CreateBody> = {}): Record<string, unknown> => ({
  language: 'ru',
  name: 'Основной',
  currency: 'PLN',
  timezone: 'Europe/Warsaw',
  withDefaultCategories: true,
  idempotencyKey: 'form-opened-once',
  ...over,
});

describe('/budgets (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const create = (userId: string, body: Record<string, unknown>, acceptLanguage?: string) => {
    const call = request(app.getHttpServer() as Server)
      .post('/budgets')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

    return acceptLanguage === undefined ? call : call.set('Accept-Language', acceptLanguage);
  };

  const list = (userId: string) =>
    request(app.getHttpServer() as Server)
      .get('/budgets')
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.transaction.deleteMany({ where: owned });
    await prisma.category.deleteMany({ where: owned });
    await prisma.categoryGroup.deleteMany({ where: owned });
    await prisma.account.deleteMany({ where: owned });
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.budget.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
  };

  const rowsOf = async (userId: string) => ({
    budgets: await prisma.budget.count({ where: { userId } }),
    groups: await prisma.categoryGroup.count({ where: { userId } }),
    categories: await prisma.category.count({ where: { userId } }),
    keys: await prisma.idempotencyKey.count({ where: { userId } }),
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

  describe('POST /budgets', () => {
    it('writes the budget and reproduces the default set row for row', async () => {
      const response = await create(USER_FIRST, creation());
      expect(response.status).toBe(201);

      const budget = await prisma.budget.findFirstOrThrow({ where: { userId: USER_FIRST } });
      const groups = await prisma.categoryGroup.findMany({
        where: { userId: USER_FIRST },
        orderBy: { sortOrder: 'asc' },
      });
      const categories = await prisma.category.findMany({
        where: { userId: USER_FIRST },
        orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }],
      });

      const expected = defaultCategories('RU');

      expect(groups.map((group) => [group.name, group.sortOrder])).toEqual(
        expected.map((group) => [group.name, group.sortOrder]),
      );
      expect(categories).toHaveLength(11);

      for (const group of groups) {
        const written = categories
          .filter((category) => category.groupId === group.id)
          .sort((left, right) => left.sortOrder - right.sortOrder);
        const source = expected.find((candidate) => candidate.name === group.name);

        expect(written.map((category) => [category.name, category.sortOrder])).toEqual(
          source?.categories.map((category) => [category.name, category.sortOrder]),
        );
        for (const category of written) {
          expect(category.budgetId).toBe(budget.id);
          expect(category.userId).toBe(USER_FIRST);
        }
      }
    });

    it('answers with the budget in exactly the shape the contract publishes', async () => {
      const response = await create(
        USER_FIRST,
        creation({ currency: 'PLN', name: '  Основной  ' }),
      );
      const document = await generateOpenApiDocument();
      const published = document.components?.schemas?.['BudgetResponse'];
      const fields =
        published && 'properties' in published ? Object.keys(published.properties ?? {}) : [];

      expect(response.status).toBe(201);

      const budget = asRecord(response.body);
      expect(Object.keys(budget).sort()).toEqual(fields.sort());
      expect(typeof budget['id']).toBe('string');
      expect(budget['id']).not.toBe('');
      expect(budget).toMatchObject({
        name: 'Основной',
        currency: 'PLN',
        minorDigits: 2,
        timezone: 'Europe/Warsaw',
        active: true,
      });
    });

    it('creates the first budget active, which is what the onboarding gate reads', async () => {
      await create(USER_FIRST, creation());

      const budget = await prisma.budget.findFirstOrThrow({ where: { userId: USER_FIRST } });
      expect(budget.active).toBe(true);
    });

    it('creates the budget without a single category when they were not asked for', async () => {
      const response = await create(USER_PLAIN, creation({ withDefaultCategories: false }));

      expect(response.status).toBe(201);
      await expect(rowsOf(USER_PLAIN)).resolves.toMatchObject({
        budgets: 1,
        groups: 0,
        categories: 0,
      });
    });

    it('freezes the currency’s own digit count on the row, not a hardcoded two', async () => {
      await create(USER_YEN, creation({ currency: 'JPY' }));
      await create(USER_PLAIN, creation({ currency: 'USD' }));

      const yen = await prisma.budget.findFirstOrThrow({ where: { userId: USER_YEN } });
      const dollar = await prisma.budget.findFirstOrThrow({ where: { userId: USER_PLAIN } });

      expect(yen.minorDigits).toBe(0);
      expect(yen.minorDigits).toBe(minorDigits('JPY'));
      expect(dollar.minorDigits).toBe(2);
    });

    it('stores the timezone the caller sent', async () => {
      await create(USER_FIRST, creation({ timezone: 'America/New_York' }));

      const budget = await prisma.budget.findFirstOrThrow({ where: { userId: USER_FIRST } });
      expect(budget.timezone).toBe('America/New_York');
    });

    describe('rejects', () => {
      it.each([
        ['a missing categories flag', { withDefaultCategories: undefined }],
        ['a boolean sent as a string', { withDefaultCategories: 'true' }],
        ['a currency no runtime knows', { currency: 'ZZZ' }],
        ['an unknown language', { language: 'de' }],
        ['a name of spaces only', { name: '   ' }],
        ['a name past the limit', { name: 'x'.repeat(61) }],
        ['an idempotency key of spaces only', { idempotencyKey: '   ' }],
        ['a timezone that is not one', { timezone: 'Mars/Olympus' }],
        ['a fixed offset in place of a zone', { timezone: '+03:00' }],
        ['a field the DTO never declared', { colour: 'blue' }],
      ])('%s with 400, writing nothing', async (_case, over) => {
        const body = creation(over as Partial<CreateBody>);
        if ('withDefaultCategories' in over && over.withDefaultCategories === undefined) {
          delete body['withDefaultCategories'];
        }

        const response = await create(USER_REJECT, body);

        expect(response.status).toBe(400);
        await expect(rowsOf(USER_REJECT)).resolves.toEqual({
          budgets: 0,
          groups: 0,
          categories: 0,
          keys: 0,
        });
      });

      it('a name that is only just too long, while accepting the longest allowed one', async () => {
        const longest = 'x'.repeat(60);

        const accepted = await create(USER_FIRST, creation({ name: `  ${longest}  ` }));

        expect(accepted.status).toBe(201);
        const budget = await prisma.budget.findFirstOrThrow({ where: { userId: USER_FIRST } });
        expect(budget.name).toBe(longest);
      });
    });

    describe('the interface language', () => {
      it('takes the language from the request, not from Accept-Language', async () => {
        await create(USER_FIRST, creation({ language: 'ru' }), 'pl-PL,pl;q=0.9');

        const settings = await prisma.userSettings.findUniqueOrThrow({
          where: { userId: USER_FIRST },
        });
        const categories = await prisma.category.findMany({ where: { userId: USER_FIRST } });

        expect(settings.language).toBe('RU');
        expect(categories.map((category) => category.name)).toContain('Продукты');
      });

      it('creates the settings row for a caller who never had one', async () => {
        await expect(prisma.userSettings.count({ where: { userId: USER_FIRST } })).resolves.toBe(0);

        const response = await create(USER_FIRST, creation({ language: 'pl' }));

        expect(response.status).toBe(201);
        const settings = await prisma.userSettings.findUniqueOrThrow({
          where: { userId: USER_FIRST },
        });
        expect(settings.language).toBe('PL');
      });

      it('updates the settings row of a caller who already had one', async () => {
        await request(app.getHttpServer() as Server)
          .get('/user-settings')
          .set('Authorization', `Bearer ${tokenFor(USER_SETTLED)}`)
          .set('Accept-Language', 'en')
          .expect(200);

        await create(USER_SETTLED, creation({ language: 'pl' }));

        const settings = await prisma.userSettings.findUniqueOrThrow({
          where: { userId: USER_SETTLED },
        });
        expect(settings.language).toBe('PL');
      });

      it('is stored even when no default categories were asked for', async () => {
        await create(USER_PLAIN, creation({ language: 'en', withDefaultCategories: false }));

        const settings = await prisma.userSettings.findUniqueOrThrow({
          where: { userId: USER_PLAIN },
        });
        expect(settings.language).toBe('EN');
      });
    });

    describe('the idempotency key', () => {
      it('answers a repeat with the first result instead of creating a second budget', async () => {
        const first = await create(USER_REPEAT, creation({ idempotencyKey: 'once' }));
        const repeat = await create(USER_REPEAT, creation({ idempotencyKey: 'once' }));

        expect(repeat.status).toBe(201);
        expect(repeat.body).toEqual(first.body);
        await expect(rowsOf(USER_REPEAT)).resolves.toMatchObject({ budgets: 1, categories: 11 });
      });

      it('applies one key once when two requests arrive together', async () => {
        const responses = await Promise.all([
          create(USER_RACE, creation({ idempotencyKey: 'double-click' })),
          create(USER_RACE, creation({ idempotencyKey: 'double-click' })),
        ]);

        for (const response of responses) {
          expect(response.status).toBe(201);
        }
        await expect(rowsOf(USER_RACE)).resolves.toMatchObject({ budgets: 1, categories: 11 });
      });

      it('refuses a second, different intent wearing the first one’s key', async () => {
        await create(USER_CHANGED, creation({ idempotencyKey: 'shared' }));

        const changed = await create(
          USER_CHANGED,
          creation({ idempotencyKey: 'shared', withDefaultCategories: false }),
        );

        expect(changed.status).toBe(409);
        await expect(rowsOf(USER_CHANGED)).resolves.toMatchObject({ budgets: 1 });
      });
    });

    it('deactivates the previous budget, leaving exactly one active', async () => {
      await create(USER_SECOND, creation({ name: 'Первый', idempotencyKey: 'first' }));
      const response = await create(
        USER_SECOND,
        creation({ name: 'Второй', idempotencyKey: 'second', withDefaultCategories: false }),
      );

      expect(response.status).toBe(201);
      const budgets = await prisma.budget.findMany({ where: { userId: USER_SECOND } });

      expect(budgets).toHaveLength(2);
      expect(budgets.filter((budget) => budget.active)).toHaveLength(1);
      expect(budgets.find((budget) => budget.active)?.name).toBe('Второй');
    });

    it('answers 401 to an anonymous caller and writes nothing', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/budgets')
        .send(creation());

      expect(response.status).toBe(401);
      await expect(prisma.budget.count({ where: owned })).resolves.toBe(0);
    });
  });

  describe('GET /budgets', () => {
    it('answers with the caller’s budgets, the active one among them', async () => {
      await create(USER_SECOND, creation({ name: 'Первый', idempotencyKey: 'first' }));
      await create(
        USER_SECOND,
        creation({ name: 'Второй', idempotencyKey: 'second', withDefaultCategories: false }),
      );

      const response = await list(USER_SECOND);

      expect(response.status).toBe(200);
      const stored = await prisma.budget.findMany({
        where: { userId: USER_SECOND },
        orderBy: { createdAt: 'asc' },
      });
      const budgets = response.body as Array<{ id: string; name: string; active: boolean }>;
      expect(budgets.map((budget) => budget.id)).toEqual(stored.map((budget) => budget.id));
      expect(budgets.map((budget) => budget.name)).toEqual(['Первый', 'Второй']);
      expect(budgets.filter((budget) => budget.active).map((budget) => budget.name)).toEqual([
        'Второй',
      ]);
    });

    it('answers with an empty list for a caller part way through onboarding', async () => {
      const response = await list(USER_EMPTY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('answers 401 to an anonymous caller', async () => {
      await request(app.getHttpServer() as Server)
        .get('/budgets')
        .expect(401);
    });
  });

  describe('one user never reaches another (ADR-005)', () => {
    it('shows B nothing of A’s budgets', async () => {
      await create(USER_A, creation({ name: 'Личный A' }));

      const response = await list(USER_B);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('lets B use a key string A has already claimed', async () => {
      await create(USER_A, creation({ idempotencyKey: 'shared-string' }));

      const response = await create(USER_B, creation({ idempotencyKey: 'shared-string' }));

      expect(response.status).toBe(201);
      await expect(rowsOf(USER_B)).resolves.toMatchObject({ budgets: 1, categories: 11 });
    });

    it('leaves every row of A’s untouched when B creates a budget', async () => {
      await create(USER_A, creation({ name: 'Личный A' }));
      const before = await rowsOf(USER_A);
      const budgetOfA = await prisma.budget.findFirstOrThrow({ where: { userId: USER_A } });

      await create(USER_B, creation({ name: 'Личный B' }));

      await expect(rowsOf(USER_A)).resolves.toEqual(before);
      const after = await prisma.budget.findFirstOrThrow({ where: { userId: USER_A } });
      expect(after).toEqual(budgetOfA);
    });
  });
});
