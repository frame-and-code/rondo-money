import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { enableWebCors, resolveWebOrigin } from '@/cors';

// Integration level of the F0.8 harness (API ↔ DB): boots the real app, which connects
// to the F0.3 Postgres, and asserts GET /health reports the DB as up. Requires the
// local DB running (`docker compose up -d`).
describe('GET /health (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Apply the same CORS config bootstrap() uses, so the preflight assertion below is real.
    enableWebCors(app);
    await app.init();
  });

  afterAll(async () => {
    // Guard against a beforeAll failure leaving `app` unassigned, so teardown can't throw
    // a secondary error that masks the real failure.
    if (app) {
      await app.close();
    }
  });

  it('returns 200 with the database up', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', info: { database: 'up' } });
  });

  it('answers the browser CORS preflight for the web origin', async () => {
    const server = app.getHttpServer() as Server;
    // Resolve the origin the same way the app does, so the test holds even when
    // WEB_ORIGIN is overridden in the environment.
    const webOrigin = resolveWebOrigin(app);
    const response = await request(server)
      .options('/health')
      .set('Origin', webOrigin)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
  });
});
