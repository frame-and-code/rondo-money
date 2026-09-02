import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_PREFIX = 'user_2rondoUserSettings';

const USER_FRESH = `${USER_PREFIX}Fresh`;
const USER_REPEAT = `${USER_PREFIX}Repeat`;
const USER_CONCURRENT = `${USER_PREFIX}Concurrent`;
const USER_POLISH = `${USER_PREFIX}Polish`;
const USER_GERMAN = `${USER_PREFIX}German`;
const USER_SILENT = `${USER_PREFIX}Silent`;
const USER_A = `${USER_PREFIX}OwnerA`;
const USER_B = `${USER_PREFIX}OwnerB`;
const USER_PICKS = `${USER_PREFIX}Picks`;
const USER_STORED = `${USER_PREFIX}Stored`;
const USER_UNSEEN = `${USER_PREFIX}Unseen`;
const USER_REFUSED = `${USER_PREFIX}Refused`;
const USER_TWICE = `${USER_PREFIX}Twice`;
const USER_REUSED = `${USER_PREFIX}Reused`;
const USER_KEEPS = `${USER_PREFIX}Keeps`;
const USER_TAKES = `${USER_PREFIX}Takes`;

describe('GET /user-settings (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (userId: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return key.signToken({ sub: userId, iat: now, exp: now + 60, azp: webOrigin });
  };

  const get = (userId: string, acceptLanguage?: string) => {
    const call = request(app.getHttpServer() as Server)
      .get('/user-settings')
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

    return acceptLanguage === undefined ? call : call.set('Accept-Language', acceptLanguage);
  };

  const patch = (userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .patch('/user-settings')
      .set('Authorization', `Bearer ${tokenFor(userId)}`)
      .send(body);

  const owned = { userId: { startsWith: USER_PREFIX } };

  const removeFixtures = async (): Promise<void> => {
    await prisma.idempotencyKey.deleteMany({ where: owned });
    await prisma.userSettings.deleteMany({ where: owned });
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

  it('creates exactly one row on the first call and answers with it', async () => {
    const response = await get(USER_FRESH, 'pl-PL,pl;q=0.9,en;q=0.8');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ language: 'pl' });

    const rows = await prisma.userSettings.findMany({ where: { userId: USER_FRESH } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.language).toBe('PL');
  });

  it('reads on every later call without rewriting the row', async () => {
    await get(USER_REPEAT, 'ru');
    const created = await prisma.userSettings.findUniqueOrThrow({ where: { userId: USER_REPEAT } });

    const response = await get(USER_REPEAT, 'pl');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ language: 'ru' });

    const stored = await prisma.userSettings.findUniqueOrThrow({ where: { userId: USER_REPEAT } });
    expect(stored).toEqual(created);
    expect(stored.updatedAt).toEqual(created.updatedAt);
  });

  it('keeps one row when the first calls arrive at once', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => get(USER_CONCURRENT, 'pl')),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ language: 'pl' });
    }
    await expect(prisma.userSettings.count({ where: { userId: USER_CONCURRENT } })).resolves.toBe(
      1,
    );
  });

  it('detects the language from Accept-Language, and falls back to English', async () => {
    const polish = await get(USER_POLISH, 'pl-PL');
    expect(polish.body).toEqual({ language: 'pl' });

    const german = await get(USER_GERMAN, 'de-DE,de;q=0.9');
    expect(german.body).toEqual({ language: 'en' });
  });

  it('settles on English when the caller sends no Accept-Language at all', async () => {
    const response = await get(USER_SILENT);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ language: 'en' });
  });

  it('answers 401 to an anonymous caller, in the shape the spec documents', async () => {
    const response = await request(app.getHttpServer() as Server).get('/user-settings');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
    });
    await expect(
      prisma.userSettings.count({ where: { userId: { startsWith: USER_PREFIX } } }),
    ).resolves.toBe(0);
  });

  it("never answers with, or disturbs, another user's settings", async () => {
    await get(USER_A, 'ru');
    const rowOfA = await prisma.userSettings.findUniqueOrThrow({ where: { userId: USER_A } });

    const response = await get(USER_B, 'pl');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ language: 'pl' });

    const stored = await prisma.userSettings.findUniqueOrThrow({ where: { userId: USER_A } });
    expect(stored).toEqual(rowOfA);
    await expect(
      prisma.userSettings.count({ where: { userId: { startsWith: USER_PREFIX } } }),
    ).resolves.toBe(2);
  });

  it('stores the language it answered with, in the shape the column holds', async () => {
    await get(USER_GERMAN, 'de-DE,de;q=0.9');
    await get(USER_STORED, 'pl-PL');

    const german = await prisma.userSettings.findUniqueOrThrow({ where: { userId: USER_GERMAN } });
    const polish = await prisma.userSettings.findUniqueOrThrow({ where: { userId: USER_STORED } });

    expect(german.language).toBe('EN');
    expect(polish.language).toBe('PL');
  });

  describe('PATCH /user-settings', () => {
    it('changes the language, and the next read answers with it', async () => {
      await get(USER_PICKS, 'en');

      const response = await patch(USER_PICKS, {
        language: 'ru',
        idempotencyKey: 'the-screen-opened-once',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ language: 'ru' });
      await expect(get(USER_PICKS)).resolves.toMatchObject({ body: { language: 'ru' } });
    });

    it('writes the settings of a caller who has never read them', async () => {
      const response = await patch(USER_UNSEEN, {
        language: 'pl',
        idempotencyKey: 'never-read-first',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ language: 'pl' });
      await expect(prisma.userSettings.count({ where: { userId: USER_UNSEEN } })).resolves.toBe(1);
    });

    it.each([
      ['a language the app cannot render', { language: 'de', idempotencyKey: 'refused' }],
      ['a language that is not one', { language: 'system', idempotencyKey: 'refused' }],
      ['a language spelled as the column spells it', { language: 'RU', idempotencyKey: 'refused' }],
      ['no language at all', { idempotencyKey: 'refused' }],
      ['no idempotency key', { language: 'ru' }],
      ['a key of nothing but spaces', { language: 'ru', idempotencyKey: '   ' }],
      [
        'a field the endpoint never declared',
        { language: 'ru', idempotencyKey: 'refused', theme: 'dark' },
      ],
    ])('refuses %s, and writes nothing', async (_case, body) => {
      const response = await patch(USER_REFUSED, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      await expect(prisma.userSettings.count({ where: { userId: USER_REFUSED } })).resolves.toBe(0);
    });

    it('answers a repeat with the first result, and writes nothing a second time', async () => {
      await get(USER_TWICE, 'en');
      const first = await patch(USER_TWICE, {
        language: 'pl',
        idempotencyKey: 'the-screen-opened-once',
      });
      const written = await prisma.userSettings.findUniqueOrThrow({
        where: { userId: USER_TWICE },
      });

      const repeat = await patch(USER_TWICE, {
        language: 'pl',
        idempotencyKey: 'the-screen-opened-once',
      });

      expect(repeat.status).toBe(200);
      expect(repeat.body).toEqual(first.body);

      const stored = await prisma.userSettings.findUniqueOrThrow({
        where: { userId: USER_TWICE },
      });
      expect(stored.updatedAt).toEqual(written.updatedAt);
      await expect(prisma.idempotencyKey.count({ where: { userId: USER_TWICE } })).resolves.toBe(1);
    });

    it('refuses a key claimed by a different language rather than replaying the first', async () => {
      await get(USER_REUSED, 'en');
      await patch(USER_REUSED, { language: 'pl', idempotencyKey: 'claimed-once' });

      const response = await patch(USER_REUSED, { language: 'ru', idempotencyKey: 'claimed-once' });

      expect(response.status).toBe(409);
      await expect(get(USER_REUSED)).resolves.toMatchObject({ body: { language: 'pl' } });
    });

    it("never changes another user's language", async () => {
      await get(USER_KEEPS, 'ru');
      const rowOfKeeps = await prisma.userSettings.findUniqueOrThrow({
        where: { userId: USER_KEEPS },
      });
      await get(USER_TAKES, 'en');

      const response = await patch(USER_TAKES, {
        language: 'pl',
        idempotencyKey: 'the-screen-opened-once',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ language: 'pl' });

      const stored = await prisma.userSettings.findUniqueOrThrow({
        where: { userId: USER_KEEPS },
      });
      expect(stored).toEqual(rowOfKeeps);
    });

    it('answers 401 to an anonymous caller, and writes nothing', async () => {
      const response = await request(app.getHttpServer() as Server)
        .patch('/user-settings')
        .send({ language: 'ru', idempotencyKey: 'anonymous' });

      expect(response.status).toBe(401);
      await expect(prisma.userSettings.count({ where: owned })).resolves.toBe(0);
    });
  });
});
