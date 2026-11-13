import { randomInt } from 'node:crypto';
import { type Server } from 'node:http';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { CurrentUserId } from '@/auth/current-user.decorator';
import { resolveWebOrigin } from '@/cors';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthFailureStore } from '@/raw-sql/auth-failure-store';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const LIMIT = 20;
const CLIENT_PREFIX = '2001:db8:';
const USER_ID = 'user_2rondoRateLimitSubject000';

@Controller('test')
class LimitProbeController {
  @Get('protected')
  protectedRoute(@CurrentUserId() userId: string): { userId: string } {
    return { userId };
  }
}

const freshClient = (): string =>
  `2001:db8:${randomInt(0x10000).toString(16)}:${randomInt(0x10000).toString(16)}::1`;

const clientKeyOf = (address: string): string => `${address.slice(0, -1)}/64`;

async function untilAFreshMinute(): Promise<void> {
  const seconds = new Date().getUTCSeconds();
  if (seconds >= 45) {
    await new Promise((resolve) => setTimeout(resolve, (61 - seconds) * 1000));
  }
}

describe('failed authentication is limited per client (integration)', () => {
  let first: INestApplication;
  let second: INestApplication;
  let prisma: PrismaService;
  let key: TestSigningKey;
  let webOrigin: string;

  const original = {
    jwtKey: process.env.CLERK_JWT_KEY,
    header: process.env.CLIENT_IP_HEADER,
  };

  const start = async (): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [LimitProbeController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.listen(0);

    return app;
  };

  const call = (app: INestApplication, path: string, client: string, token?: string) => {
    const pending = request(app.getHttpServer() as Server)
      .get(path)
      .set('X-Real-IP', client);

    return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
  };

  const fail = (app: INestApplication, client: string) =>
    call(app, '/test/protected', client, 'not-a-jwt');

  const blockOn = async (app: INestApplication, client: string): Promise<void> => {
    for (let failure = 0; failure < LIMIT; failure += 1) {
      await fail(app, client);
    }
    expect((await fail(app, client)).status).toBe(429);
  };

  const validToken = (): string => {
    const now = Math.floor(Date.now() / 1000);

    return key.signToken({ sub: USER_ID, iat: now, exp: now + 60, azp: webOrigin });
  };

  beforeAll(async () => {
    key = createTestSigningKey();
    process.env.CLERK_JWT_KEY = key.publicKeyPem;
    process.env.CLIENT_IP_HEADER = 'x-real-ip';

    first = await start();
    second = await start();
    prisma = first.get(PrismaService);
    webOrigin = resolveWebOrigin(first.get(ConfigService));
  });

  afterAll(async () => {
    await prisma?.authFailure.deleteMany({ where: { clientKey: { startsWith: CLIENT_PREFIX } } });
    await first?.close();
    await second?.close();
    for (const [name, value] of [
      ['CLERK_JWT_KEY', original.jwtKey],
      ['CLIENT_IP_HEADER', original.header],
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('answers 401 up to the limit, then 429 with Retry-After, and keeps refusing', async () => {
    await untilAFreshMinute();
    const client = freshClient();

    for (let failure = 0; failure < LIMIT; failure += 1) {
      expect((await fail(first, client)).status).toBe(401);
    }

    const over = await fail(first, client);
    expect(over.status).toBe(429);
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(over.headers['retry-after'])).toBeLessThanOrEqual(60);

    expect((await call(first, '/test/protected', client)).status).toBe(429);
  }, 30_000);

  it('leaves another client alone while one is blocked', async () => {
    await untilAFreshMinute();
    const blocked = freshClient();
    await blockOn(first, blocked);

    expect((await fail(first, freshClient())).status).toBe(401);
  }, 30_000);

  it('lets a valid token through from a blocked address', async () => {
    await untilAFreshMinute();
    const client = freshClient();
    await blockOn(first, client);

    const signedIn = await call(first, '/test/protected', client, validToken());

    expect(signedIn.status).toBe(200);
    expect(signedIn.body).toEqual({ userId: USER_ID });
  }, 30_000);

  it('keeps the healthcheck open to a blocked address', async () => {
    await untilAFreshMinute();
    const client = freshClient();
    await blockOn(first, client);

    expect((await call(first, '/health', client)).status).toBe(200);
  }, 30_000);

  it('counts failures across two instances on one database as one count', async () => {
    await untilAFreshMinute();
    const client = freshClient();

    for (let failure = 0; failure < LIMIT / 2; failure += 1) {
      expect((await fail(first, client)).status).toBe(401);
    }
    for (let failure = 0; failure < LIMIT / 2; failure += 1) {
      expect((await fail(second, client)).status).toBe(401);
    }

    expect((await fail(second, client)).status).toBe(429);
  }, 30_000);

  it('loses no failure that two instances record for one client at the same moment', async () => {
    await untilAFreshMinute();
    const client = clientKeyOf(freshClient());
    const [one, other] = [first.get(AuthFailureStore), second.get(AuthFailureStore)];

    await Promise.all(
      Array.from({ length: LIMIT }, (_unused, index) =>
        (index % 2 === 0 ? one : other).record(client),
      ),
    );

    const [row] = await prisma.authFailure.findMany({ where: { clientKey: client } });
    expect(row?.hits).toBe(LIMIT);
  }, 30_000);

  it('sweeps ended windows a bounded batch at a time', async () => {
    await untilAFreshMinute();
    const thisMinute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const ended = { lt: thisMinute };
    const stale = Array.from({ length: 150 }, () => clientKeyOf(freshClient()));
    await prisma.authFailure.createMany({
      data: stale.map((clientKey) => ({
        clientKey,
        windowStart: new Date(thisMinute.getTime() - 5 * 60_000),
        hits: 1,
      })),
    });
    const before = await prisma.authFailure.count({ where: { windowStart: ended } });

    await fail(first, freshClient());

    expect(before - (await prisma.authFailure.count({ where: { windowStart: ended } }))).toBe(100);
    await prisma.authFailure.deleteMany({ where: { windowStart: ended } });
  }, 30_000);

  it('counts in the database minute and sweeps the windows that have ended', async () => {
    await untilAFreshMinute();
    const stale = clientKeyOf(freshClient());
    await prisma.authFailure.create({
      data: { clientKey: stale, windowStart: new Date(Date.now() - 5 * 60_000), hits: 3 },
    });
    const client = freshClient();

    await fail(first, client);

    const rows = await prisma.authFailure.findMany({ where: { clientKey: clientKeyOf(client) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hits).toBe(1);
    expect(rows[0]?.windowStart.getUTCSeconds()).toBe(0);
    expect(rows[0]?.windowStart.getUTCMilliseconds()).toBe(0);
    expect(await prisma.authFailure.count({ where: { clientKey: stale } })).toBe(0);
  }, 30_000);
});
