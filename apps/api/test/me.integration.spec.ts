import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_ID = 'user_2rondoMeEndpointSubject00';

// Integration level (F0.8) against the real AppModule, so the endpoint answers behind the
// same global guard it will in production. Needs the local Postgres (`docker compose up -d`),
// because AppModule connects to it — even though this endpoint touches no table.
//
// GET /me is what F1.4 leans on for "web makes an authorized request through the generated
// client": until F1.6 it is the only protected endpoint, so it is also the only place the
// full chain (token → guard → @CurrentUserId) can be proven over HTTP.
describe('GET /me (integration)', () => {
  let app: INestApplication;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  beforeAll(async () => {
    key = createTestSigningKey();
    now = Math.floor(Date.now() / 1000);
    // Point the guard at a key pair we own, so the suite is networkless and deterministic
    // even on a machine whose apps/api/.env.local holds a real Clerk key.
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    webOrigin = resolveWebOrigin(app.get(ConfigService));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    // Integration specs share one process (--runInBand) — leave the environment as found.
    if (originalJwtKey === undefined) {
      delete process.env.CLERK_JWT_KEY;
    } else {
      process.env.CLERK_JWT_KEY = originalJwtKey;
    }
  });

  it('answers with the user id from the verified token', async () => {
    const token = key.signToken({ sub: USER_ID, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .get('/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_ID });
  });

  it('answers 401 to an anonymous caller, in the shape the spec documents', async () => {
    const response = await request(app.getHttpServer() as Server).get('/me');

    expect(response.status).toBe(401);
    // `UnauthorizedResponse` is what the contract promises clients, and a generated client
    // types the error by it — so the promise is checked against the real response here rather
    // than trusted. The message stays deliberately vague; the reason is in the log.
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: expect.any(String) as unknown,
    });
  });

  it('ignores a user id the caller supplies itself', async () => {
    // The identity comes from the token's `sub` and from nowhere else (ADR-005): a query
    // parameter or header naming another user must change nothing.
    const token = key.signToken({ sub: USER_ID, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .get('/me?userId=user_attacker')
      .set('Authorization', `Bearer ${token}`)
      .set('X-User-Id', 'user_attacker');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_ID });
  });
});
