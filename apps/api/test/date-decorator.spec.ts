import { type Server } from 'node:http';

import { Controller, Get, type INestApplication, Query } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiCalendarDateProperty } from '@/validation/date.decorator';
import { VALIDATION_PIPE } from '@/validation/validation.options';

const PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

class DayQuery {
  @ApiCalendarDateProperty({ description: 'The day the record is dated.' })
  date!: string;

  @ApiCalendarDateProperty({ required: false, description: 'The day a period ends on.' })
  until?: string;
}

class DayResponse {
  @ApiCalendarDateProperty()
  date!: string;
}

@Controller('days')
class DaysController {
  @Get()
  @ApiOkResponse({ type: DayResponse })
  read(@Query() query: DayQuery): DayResponse {
    return { date: query.date };
  }
}

describe('a calendar date at the API boundary', () => {
  let app: INestApplication;

  const open = (date?: string) =>
    request(app.getHttpServer() as Server).get(
      date === undefined ? '/days' : `/days?date=${encodeURIComponent(date)}`,
    );

  const openUntil = (until: string) =>
    request(app.getHttpServer() as Server).get(
      `/days?date=2026-08-31&until=${encodeURIComponent(until)}`,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DaysController],
      providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('input', () => {
    it('accepts a day the calendar has', async () => {
      await open('2026-08-31').expect(200, { date: '2026-08-31' });
      await open('2028-02-29').expect(200, { date: '2028-02-29' });
    });

    it('rejects a day no month answers to, even though it has the shape', async () => {
      await open('2026-02-30').expect(400);
      await open('2026-02-29').expect(400);
      await open('2026-13-01').expect(400);
      await open('2026-00-10').expect(400);
    });

    it('rejects anything that is not the year-month-day shape', async () => {
      for (const date of ['2026-8-1', '31.08.2026', '20260831', '2026-08', '', ' 2026-08-31 ']) {
        await open(date).expect(400);
      }
    });

    it('rejects a missing day, because a record is never dated "whenever"', async () => {
      await open().expect(400);
    });

    it('says which field failed, without leaking internals', async () => {
      const response = await open('2026-02-30').expect(400);

      expect(JSON.stringify(response.body)).toContain('date');
      expect(JSON.stringify(response.body)).not.toMatch(/at .*\.ts:\d+|node_modules|\/Users\//);
    });
  });

  describe('a day the caller may leave out', () => {
    it('lets the request through when it is absent', async () => {
      await open('2026-08-31').expect(200);
    });

    it('still refuses a day that is there and unusable', async () => {
      await openUntil('2026-02-30').expect(400);
      await openUntil('yesterday').expect(400);
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

    it('publishes a date as a string carrying the shape the pipe enforces', () => {
      expect(document.components?.schemas?.['DayResponse']).toMatchObject({
        required: ['date'],
        properties: { date: { type: 'string', pattern: PATTERN, example: '2026-08-31' } },
      });
    });

    it('carries the caller-supplied description onto the query parameter', () => {
      const parameter = document.paths['/days']?.get?.parameters?.[0];

      expect(parameter).toMatchObject({
        name: 'date',
        in: 'query',
        required: true,
        description: 'The day the record is dated.',
        schema: { pattern: PATTERN },
      });
    });

    it('publishes the day a caller may leave out as optional', () => {
      const parameter = document.paths['/days']?.get?.parameters?.[1];

      expect(parameter).toMatchObject({ name: 'until', in: 'query', required: false });
    });
  });
});
