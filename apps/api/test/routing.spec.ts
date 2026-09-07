import { type Server } from 'node:http';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { ROUTING_OPTIONS } from '@/routing';

@Controller('probe')
class ParametricFirstController {
  @Get(':id')
  byId(): { handler: string } {
    return { handler: 'byId' };
  }

  @Get('me')
  me(): { handler: string } {
    return { handler: 'me' };
  }
}

@Controller('probe')
class DuplicateController {
  @Get('me')
  first(): { handler: string } {
    return { handler: 'first' };
  }

  @Get('me')
  second(): { handler: string } {
    return { handler: 'second' };
  }
}

describe('how the app resolves its routes', () => {
  let app: INestApplication;

  beforeEach(() => {
    app = undefined as unknown as INestApplication;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  const bootProbe = async (controller: unknown): Promise<INestApplication> => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [controller as new () => unknown],
    }).compile();

    app = moduleRef.createNestApplication(ROUTING_OPTIONS);

    return app;
  };

  it('serves the literal path even where the parameter that covers it was declared first', async () => {
    await (await bootProbe(ParametricFirstController)).listen(0);

    const me = await request(app.getHttpServer() as Server).get('/probe/me');
    const other = await request(app.getHttpServer() as Server).get('/probe/anything');

    expect(me.body).toEqual({ handler: 'me' });
    expect(other.body).toEqual({ handler: 'byId' });
  });

  it('refuses to start when two handlers claim one method and path', async () => {
    await expect((await bootProbe(DuplicateController)).init()).rejects.toThrow(
      'Duplicate route: GET /probe/me',
    );
  });
});
