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

/**
 * Endpoints that exist only for this suite. The app has no protected route of its own yet
 * — the first one arrives with F1.3 — and the guard is precisely what has to be proven
 * before anything is built on top of it. They are declared on the testing module, so the
 * real `APP_GUARD` from `AppModule` is what answers: the wiring is under test too, not
 * just the guard class.
 */
@Controller('test')
class GuardProbeController {
  @Get('protected')
  protectedRoute(@CurrentUserId() userId: string): { userId: string } {
    return { userId };
  }

  /**
   * Deliberately without `@CurrentUserId()`: it is what proves the *guard* closes the
   * route. Every other protected case here would answer 401 from the parameter decorator
   * alone, so a handler that never reads the identity is where an unprotected app shows.
   */
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

// Integration level (F0.8): the real AppModule, so the guard runs exactly as it will in
// production — same global registration, same verifyToken(). Needs the local Postgres
// (`docker compose up -d`), because AppModule connects to it.
describe('Clerk auth guard (integration)', () => {
  let app: INestApplication;
  let key: TestSigningKey;
  let now: number;
  let webOrigin: string;

  const originalJwtKey = process.env.CLERK_JWT_KEY;
  const get = (path: string): request.Test => request(app.getHttpServer() as Server).get(path);

  /**
   * A token this app should accept. `azp` defaults to the origin the app itself trusts —
   * resolved from the app rather than hardcoded, because `WEB_ORIGIN` may be set in the
   * environment — since the guard now checks that claim (F1.3).
   */
  const signToken = (claims: Partial<SessionTokenClaims> = {}): string =>
    key.signToken({ sub: USER_ID, iat: now, exp: now + 60, azp: webOrigin, ...claims });

  beforeAll(async () => {
    key = createTestSigningKey();
    now = Math.floor(Date.now() / 1000);
    // The guard prefers CLERK_JWT_KEY over CLERK_SECRET_KEY, so pointing it at our own
    // public key makes the whole suite networkless — and deterministic on a machine whose
    // apps/api/.env.local holds a real Clerk key.
    process.env.CLERK_JWT_KEY = key.publicKeyPem;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [GuardProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    webOrigin = resolveWebOrigin(app.get(ConfigService));
  });

  afterAll(async () => {
    // Guard against a beforeAll failure leaving `app` unassigned, so teardown can't throw
    // a secondary error that masks the real failure.
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
      // Correct in every claim, including `azp` — the signature is the only thing wrong,
      // so a 401 here can only come from the verification we care about.
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
      // The verification failure (expiry dates, signature details) stays in the log: it
      // tells whoever is forging tokens which part to fix next.
      expect(response.body).toEqual({
        message: 'Invalid session token',
        error: 'Unauthorized',
        statusCode: 401,
      });
    });
  });

  // F1.3 closed this carry-over from F1.2: `verifyToken()` is configured with
  // `authorizedParties`, so a token minted for a different origin cannot be replayed here.
  // These cases are what proves the check is actually on — every other test in this file
  // would pass with it silently disabled.
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
