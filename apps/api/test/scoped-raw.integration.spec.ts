import { type Server } from 'node:http';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@rondo/db';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { Public } from '@/auth/public.decorator';
import { resolveWebOrigin } from '@/cors';
import { ScopedRawRepository } from '@/raw-sql/scoped-raw.repository';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_A = 'user_2rondoRawAaaaaaaaaaaaaaa';
const USER_B = 'user_2rondoRawBbbbbbbbbbbbbbb';

@Controller('test-raw')
class RawSqlProbeController {
  constructor(private readonly repository: ScopedRawRepository) {}

  @Get('scoped')
  async scoped(): Promise<{ userId: string }[]> {
    return this.repository.query<{ userId: string }>(
      (scope) => Prisma.sql`SELECT ${scope.userId}::text AS "userId"`,
    );
  }

  @Public()
  @Get('anonymous')
  async anonymous(): Promise<{ userId: string }[]> {
    return this.repository.query<{ userId: string }>(
      (scope) => Prisma.sql`SELECT ${scope.userId}::text AS "userId"`,
    );
  }
}

describe('ScopedRawRepository (integration)', () => {
  let app: INestApplication;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  const tokenFor = (sub: string): string =>
    key.signToken({ sub, iat: now, exp: now + 60, azp: webOrigin });

  const get = (path: string): request.Test => request(app.getHttpServer() as Server).get(path);

  beforeAll(async () => {
    key = createTestSigningKey();
    now = Math.floor(Date.now() / 1000);
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RawSqlProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    webOrigin = resolveWebOrigin(app.get(ConfigService));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (originalJwtKey === undefined) {
      delete process.env.CLERK_JWT_KEY;
    } else {
      process.env.CLERK_JWT_KEY = originalJwtKey;
    }
  });

  it('scopes the statement to the caller from the verified token', async () => {
    const response = await get('/test-raw/scoped').set(
      'Authorization',
      `Bearer ${tokenFor(USER_A)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ userId: USER_A }]);
  });

  it('gives each request its own caller, so the context never leaks between them', async () => {
    const [first, second] = await Promise.all([
      get('/test-raw/scoped').set('Authorization', `Bearer ${tokenFor(USER_A)}`),
      get('/test-raw/scoped').set('Authorization', `Bearer ${tokenFor(USER_B)}`),
    ]);

    expect([first.body, second.body]).toEqual([[{ userId: USER_A }], [{ userId: USER_B }]]);
  });

  it('refuses to run at all on a route with no identity', async () => {
    const response = await get('/test-raw/anonymous');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});
