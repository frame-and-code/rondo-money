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

  const removeFixtures = (): Promise<unknown> =>
    prisma.userSettings.deleteMany({ where: { userId: { startsWith: USER_PREFIX } } });

  beforeAll(async () => {
    key = createTestSigningKey();
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
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
});
