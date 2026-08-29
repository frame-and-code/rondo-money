import { type Server } from 'node:http';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { CurrentUserId } from '@/auth/current-user.decorator';
import { Public } from '@/auth/public.decorator';
import { resolveWebOrigin } from '@/cors';

import { createTestSigningKey, type SessionTokenClaims, type TestSigningKey } from './clerk-token';

const USER_ID = 'user_2rondoTestSubjectClaim000';

@Controller('test')
class GuardProbeController {
  @Get('protected')
  protectedRoute(@CurrentUserId() userId: string): { userId: string } {
    return { userId };
  }

  @Get('protected-without-identity')
  routeThatIgnoresIdentity(): { reached: boolean } {
    return { reached: true };
  }

  @Public()
  @Get('public')
  publicRoute(): { visibility: string } {
    return { visibility: 'public' };
  }
}

describe('Clerk auth guard (integration)', () => {
  let app: INestApplication;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;
  const get = (path: string): request.Test => request(app.getHttpServer() as Server).get(path);

  const signToken = (claims: Partial<SessionTokenClaims> = {}): string =>
    key.signToken({ sub: USER_ID, iat: now, exp: now + 60, azp: webOrigin, ...claims });

  beforeAll(async () => {
    key = createTestSigningKey();
    now = Math.floor(Date.now() / 1000);
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [GuardProbeController],
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

  describe('rejects anything but a valid token', () => {
    it('answers 401 when the Authorization header is missing', async () => {
      const response = await get('/test/protected');

      expect(response.status).toBe(401);
    });

    it('closes a handler that never reads the identity, so nothing is open by omission', async () => {
      const withoutToken = await get('/test/protected-without-identity');
      expect(withoutToken.status).toBe(401);

      const token = signToken();
      const withToken = await get('/test/protected-without-identity').set(
        'Authorization',
        `Bearer ${token}`,
      );
      expect(withToken.status).toBe(200);
    });

    it('answers 401 when the scheme is not Bearer', async () => {
      const token = signToken();
      const response = await get('/test/protected').set('Authorization', `Basic ${token}`);

      expect(response.status).toBe(401);
    });

    it('answers 401 to a token that is not a JWT', async () => {
      const response = await get('/test/protected').set('Authorization', 'Bearer not-a-jwt');

      expect(response.status).toBe(401);
    });

    it('answers 401 to a token signed by someone else', async () => {
      const forged = createTestSigningKey().signToken({
        sub: USER_ID,
        iat: now,
        exp: now + 60,
        azp: webOrigin,
      });
      const response = await get('/test/protected').set('Authorization', `Bearer ${forged}`);

      expect(response.status).toBe(401);
    });

    it('answers 401 to an expired token, without saying why', async () => {
      const expired = signToken({ iat: now - 600, exp: now - 300 });
      const response = await get('/test/protected').set('Authorization', `Bearer ${expired}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        message: 'Invalid session token',
        error: 'Unauthorized',
        statusCode: 401,
      });
    });
  });

  describe('rejects a token that was not minted for this app', () => {
    it('answers 401 when azp names another origin', async () => {
      const token = signToken({ azp: 'https://evil.example.com' });
      const response = await get('/test/protected').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('answers 401 when the token carries no azp claim at all', async () => {
      const token = key.signToken({ sub: USER_ID, iat: now, exp: now + 60 });
      const response = await get('/test/protected').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });
  });

  describe('accepts a valid token', () => {
    it('lets the request through and hands the handler the userId from `sub`', async () => {
      const token = signToken();
      const response = await get('/test/protected').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userId: USER_ID });
    });

    it('accepts the scheme in any case, as RFC 7235 requires', async () => {
      const token = signToken();
      const response = await get('/test/protected').set('Authorization', `bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userId: USER_ID });
    });

    it('takes the userId from the token even when the request claims another one', async () => {
      const token = signToken();
      const response = await get('/test/protected?userId=user_attacker')
        .set('Authorization', `Bearer ${token}`)
        .set('X-User-Id', 'user_attacker');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ userId: USER_ID });
    });
  });

  describe('lets @Public() endpoints answer anonymously', () => {
    it('serves a public handler on an otherwise protected controller', async () => {
      const response = await get('/test/public');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ visibility: 'public' });
    });

    it('serves GET /health, which the platform probes without a token', async () => {
      const response = await get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', info: { database: 'up' } });
    });
  });
});
