import { type Server } from 'node:http';

import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { Public } from '@/auth/public.decorator';
import { resolveWebOrigin } from '@/cors';
import { createHttpApp } from '@/http-app';

import { createTestSigningKey } from './clerk-token';

const DEFAULT_LIMIT_BYTES = 100 * 1024;
const SMALL_LIMIT = '1kb';
const SMALL_LIMIT_BYTES = 1024;

@Controller('test-hardening')
class HardeningProbeController {
  @Public()
  @Get('ok')
  ok(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: unknown): { received: boolean } {
    return { received: typeof body === 'object' && body !== null };
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

const bodyOfBytes = (bytes: number): string => {
  const frame = JSON.stringify({ pad: '' });
  const body = JSON.stringify({ pad: 'x'.repeat(bytes - Buffer.byteLength(frame)) });

  if (Buffer.byteLength(body) !== bytes) {
    throw new Error(`Built a body of ${Buffer.byteLength(body)} bytes, asked for ${bytes}`);
  }

  return body;
};

const expectSecurityHeaders = (headers: Record<string, unknown>): void => {
  expect(headers['content-security-policy']).toEqual(expect.stringContaining("default-src 'self'"));
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(headers['strict-transport-security']).toEqual(expect.stringContaining('max-age='));
  expect(headers).not.toHaveProperty('x-powered-by');
};

describe('the HTTP surface every app is built with', () => {
  const originalJwtKey = process.env.CLERK_JWT_KEY;
  const apps: NestExpressApplication[] = [];

  const start = async (bodyLimit?: string): Promise<Server> => {
    const app = await createHttpApp(
      HardeningProbeModule,
      bodyLimit === undefined ? {} : { bodyLimit },
    );
    apps.push(app);
    await app.listen(0);

    return app.getHttpServer();
  };

  const post = (server: Server, body: string): request.Test =>
    request(server).post('/test-hardening/echo').set('Content-Type', 'application/json').send(body);

  beforeAll(() => {
    process.env.CLERK_JWT_KEY = createTestSigningKey().publicKeyPem;
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    if (originalJwtKey === undefined) {
      delete process.env.CLERK_JWT_KEY;
    } else {
      process.env.CLERK_JWT_KEY = originalJwtKey;
    }
  });

  it('answers with the security headers and without naming the framework', async () => {
    const response = await request(await start()).get('/test-hardening/ok');

    expect(response.status).toBe(200);
    expectSecurityHeaders(response.headers);
  });

  it('answers the web origin a CORS preflight, headers included', async () => {
    const app = await createHttpApp(HardeningProbeModule);
    apps.push(app);
    await app.listen(0);
    const webOrigin = resolveWebOrigin(app.get(ConfigService));

    const response = await request(app.getHttpServer())
      .options('/test-hardening/echo')
      .set('Origin', webOrigin)
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
    expectSecurityHeaders(response.headers);
  });

  it('takes a body exactly at the limit and refuses one byte more, headers included', async () => {
    const server = await start(SMALL_LIMIT);

    const at = await post(server, bodyOfBytes(SMALL_LIMIT_BYTES));
    const over = await post(server, bodyOfBytes(SMALL_LIMIT_BYTES + 1));

    expect(at.status).toBe(200);
    expect(at.body).toEqual({ received: true });
    expect(over.status).toBe(413);
    expect(over.body).toEqual({ statusCode: 413, message: 'request entity too large' });
    expectSecurityHeaders(over.headers);
  });

  it('holds a body to a hundred kilobytes when no limit is named', async () => {
    const server = await start();

    const at = await post(server, bodyOfBytes(DEFAULT_LIMIT_BYTES));
    const over = await post(server, bodyOfBytes(DEFAULT_LIMIT_BYTES + 1));

    expect(at.status).toBe(200);
    expect(over.status).toBe(413);
  });

  it('refuses malformed JSON without a stack or a path', async () => {
    const response = await post(await start(), '{"pad": ');

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
    const response = await request(await start()).get('/test-hardening/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
  });
});
