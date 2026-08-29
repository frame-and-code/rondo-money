import { type Server } from 'node:http';

import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiTimeZoneProperty } from '@/validation/timezone.decorator';
import { VALIDATION_PIPE } from '@/validation/validation.options';

class ClockBody {
  @ApiTimeZoneProperty({ description: 'The zone this clock counts days in.' })
  timezone!: string;
}

class ClockResponse {
  @ApiTimeZoneProperty()
  timezone!: string;
}

@Controller('clocks')
class ClocksController {
  @Post()
  @ApiOkResponse({ type: ClockResponse })
  set(@Body() body: ClockBody): ClockResponse {
    return { timezone: body.timezone };
  }
}

describe('a time zone at the API boundary', () => {
  let app: INestApplication;

  const set = (body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/clocks')
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClocksController],
      providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('input', () => {
    it('accepts a named zone', async () => {
      await set({ timezone: 'Europe/Warsaw' }).expect(201, { timezone: 'Europe/Warsaw' });
      await set({ timezone: 'America/New_York' }).expect(201, { timezone: 'America/New_York' });
      await set({ timezone: 'UTC' }).expect(201, { timezone: 'UTC' });
    });

    it('rejects a zone that does not exist', async () => {
      await set({ timezone: 'Mars/Olympus' }).expect(400);
      await set({ timezone: 'Europe/Atlantis' }).expect(400);
    });

    it('rejects a fixed offset, which says nothing about when the clocks change', async () => {
      for (const timezone of ['+03:00', '-05:00', 'Etc/GMT+3']) {
        await set({ timezone }).expect(400);
      }
    });

    it('rejects a zone that is not a string, and a missing one', async () => {
      await set({ timezone: 3 }).expect(400);
      await set({ timezone: null }).expect(400);
      await set({}).expect(400);
    });

    it('says which field failed, without leaking internals', async () => {
      const response = await set({ timezone: 'Mars/Olympus' }).expect(400);

      expect(JSON.stringify(response.body)).toContain('timezone');
      expect(JSON.stringify(response.body)).not.toMatch(/at .*\.ts:\d+|node_modules|\/Users\//);
    });
  });

  describe('the published contract', () => {
    let document: OpenAPIObject;

    beforeAll(() => {
      document = SwaggerModule.createDocument(app, {
        openapi: '3.0.0',
        info: { title: 'test', version: '0' },
      });
    });

    it('publishes a zone as a string with an example a client can copy', () => {
      expect(document.components?.schemas?.['ClockBody']).toMatchObject({
        required: ['timezone'],
        properties: {
          timezone: {
            type: 'string',
            example: 'Europe/Warsaw',
            description: 'The zone this clock counts days in.',
          },
        },
      });
      expect(document.components?.schemas?.['ClockResponse']).toMatchObject({
        properties: { timezone: { type: 'string', example: 'Europe/Warsaw' } },
      });
    });
  });
});
