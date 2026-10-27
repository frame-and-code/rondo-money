import { type Server } from 'node:http';

import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { resolveWebOrigin } from '@/cors';
import { createHttpApp } from '@/http-app';

const DEFAULT_LIMIT_BYTES = 100 * 1024;
const SMALL_LIMIT = '1kb';
const SMALL_LIMIT_BYTES = 1024;
const FOREIGN_ORIGIN = 'https://elsewhere.example';

@Controller('probe')
class ProbeController {
  @Get('ok')
  ok(): { ok: true } {
    return { ok: true };
  }

  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: unknown): { received: boolean } {
    return { received: typeof body === 'object' && body !== null };
  }
}

@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true })],
  controllers: [ProbeController],
})
class ProbeModule {}

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

describe('the app createHttpApp builds', () => {
  const apps: NestExpressApplication[] = [];

  const start = async (bodyLimit?: string): Promise<NestExpressApplication> => {
    const app = await createHttpApp(ProbeModule, bodyLimit === undefined ? {} : { bodyLimit });
    apps.push(app);
    await app.listen(0);

    return app;
  };

  const serverOf = (app: NestExpressApplication): Server => app.getHttpServer();

  const post = (app: NestExpressApplication, body: string): request.Test =>
    request(serverOf(app)).post('/probe/echo').set('Content-Type', 'application/json').send(body);

  const preflight = (app: NestExpressApplication, origin: string): request.Test =>
    request(serverOf(app))
      .options('/probe/echo')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('answers with the security headers and without naming the framework', async () => {
    const response = await request(serverOf(await start())).get('/probe/ok');

    expect(response.status).toBe(200);
    expectSecurityHeaders(response.headers);
  });

  it('allows the web origin and no other', async () => {
    const app = await start();
    const webOrigin = resolveWebOrigin(app.get(ConfigService));

    const allowed = await preflight(app, webOrigin);
    const foreign = await preflight(app, FOREIGN_ORIGIN);

    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(webOrigin);
    expectSecurityHeaders(allowed.headers);
    expect(foreign.headers['access-control-allow-origin']).not.toBe(FOREIGN_ORIGIN);
  });

  it('takes a body exactly at the limit and refuses one byte more, headers included', async () => {
    const app = await start(SMALL_LIMIT);

    const at = await post(app, bodyOfBytes(SMALL_LIMIT_BYTES));
    const over = await post(app, bodyOfBytes(SMALL_LIMIT_BYTES + 1));

    expect(at.status).toBe(200);
    expect(at.body).toEqual({ received: true });
    expect(over.status).toBe(413);
    expect(over.body).toEqual({ statusCode: 413, message: 'request entity too large' });
    expectSecurityHeaders(over.headers);
  });

  it('holds a form-encoded body to the same limit', async () => {
    const app = await start(SMALL_LIMIT);
    const field = 'pad=';

    const at = await request(serverOf(app))
      .post('/probe/echo')
      .type('form')
      .send(`${field}${'x'.repeat(SMALL_LIMIT_BYTES - field.length)}`);
    const over = await request(serverOf(app))
      .post('/probe/echo')
      .type('form')
      .send(`${field}${'x'.repeat(SMALL_LIMIT_BYTES + 1 - field.length)}`);

    expect(at.status).toBe(200);
    expect(over.status).toBe(413);
  });

  it('holds a body to a hundred kilobytes when no limit is named', async () => {
    const app = await start();

    const at = await post(app, bodyOfBytes(DEFAULT_LIMIT_BYTES));
    const over = await post(app, bodyOfBytes(DEFAULT_LIMIT_BYTES + 1));

    expect(at.status).toBe(200);
    expect(over.status).toBe(413);
  });
});
