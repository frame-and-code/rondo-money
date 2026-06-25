import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';

// Integration test (F0.4 DoD): boots the real app, which connects to the F0.3 Postgres,
// and asserts GET /health reports the DB as up. Requires the local DB running.
describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
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
});
