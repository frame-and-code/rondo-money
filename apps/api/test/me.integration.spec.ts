import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { resolveWebOrigin } from '@/cors';

import { createTestSigningKey, type TestSigningKey } from './clerk-token';

const USER_ID = 'user_2rondoMeEndpointSubject00';

describe('GET /me (integration)', () => {
  let app: INestApplication;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;

  beforeAll(async () => {
    key = createTestSigningKey();
    now = Math.floor(Date.now() / 1000);
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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
    expect(response.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
    });
  });

  it('ignores a user id the caller supplies itself', async () => {
    const token = key.signToken({ sub: USER_ID, iat: now, exp: now + 60, azp: webOrigin });

    const response = await request(app.getHttpServer() as Server)
      .get('/me?userId=user_attacker')
      .set('Authorization', `Bearer ${token}`)
      .set('X-User-Id', 'user_attacker');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_ID });
  });
});
