import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { enableWebCors, resolveWebOrigin } from '@/cors';

describe('GET /health (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    enableWebCors(app);
    await app.init();
  });

  afterAll(async () => {
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
    const webOrigin = resolveWebOrigin(app.get(ConfigService));
    const response = await request(server)
      .options('/health')
      .set('Origin', webOrigin)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
  });
});
