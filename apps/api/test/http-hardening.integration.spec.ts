import { type Server } from 'node:http';

import { Controller, Get, Module } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { Public } from '@/auth/public.decorator';
import { createHttpApp } from '@/http-app';

import { createTestSigningKey } from './clerk-token';

@Controller('test-hardening')
class HardeningProbeController {
  @Public()
  @Get('ok')
  ok(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('boom')
  boom(): never {
    throw new Error(
      'relation "transactions" does not exist at /Users/someone/apps/api/src/secret.ts:42 ' +
        'while running SELECT * FROM transactions WHERE user_id = $1',
    );
  }
}

@Module({ imports: [AppModule], controllers: [HardeningProbeController] })
class HardeningProbeModule {}

describe('the HTTP surface of the whole app', () => {
  const originalJwtKey = process.env.CLERK_JWT_KEY;
  let app: NestExpressApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.CLERK_JWT_KEY = createTestSigningKey().publicKeyPem;
    app = await createHttpApp(HardeningProbeModule);
    await app.listen(0);
    server = app.getHttpServer();
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

  it('answers with the security headers and without naming the framework', async () => {
    const response = await request(server).get('/test-hardening/ok');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toEqual(
      expect.stringContaining("default-src 'self'"),
    );
    expect(response.headers).not.toHaveProperty('x-powered-by');
  });

  it('refuses malformed JSON without a stack or a path', async () => {
    const response = await request(server)
      .post('/accounts')
      .set('Content-Type', 'application/json')
      .send('{"pad": ');

    expect(response.status).toBe(400);
    const body: unknown = response.body;

    expect(typeof body === 'object' && body !== null ? Object.keys(body).sort() : body).toEqual([
      'error',
      'message',
      'statusCode',
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/node_modules|\.js:\d|\.ts:\d|\n\s+at /);
  });

  it('answers an unexpected failure with nothing of what failed', async () => {
    const response = await request(server).get('/test-hardening/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});
