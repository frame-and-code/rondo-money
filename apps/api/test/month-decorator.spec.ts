import { type Server } from 'node:http';

import { Controller, Get, type INestApplication, Query } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiCalendarMonthProperty } from '@/validation/month.decorator';
import { VALIDATION_PIPE } from '@/validation/validation.options';

class PageQuery {
  @ApiCalendarMonthProperty({ description: 'The month the screen is showing.' })
  month!: string;
}

class PageResponse {
  @ApiCalendarMonthProperty()
  month!: string;
}

@Controller('pages')
class PagesController {
  @Get()
  @ApiOkResponse({ type: PageResponse })
  open(@Query() query: PageQuery): PageResponse {
    return { month: query.month };
  }
}

describe('a calendar month at the API boundary', () => {
  let app: INestApplication;

  const open = (month?: string) =>
    request(app.getHttpServer() as Server).get(
      month === undefined ? '/pages' : `/pages?month=${encodeURIComponent(month)}`,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PagesController],
      providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('input', () => {
    it('accepts a month the calendar has', async () => {
      await open('2026-02').expect(200, { month: '2026-02' });
      await open('1970-01').expect(200, { month: '1970-01' });
    });

    it('rejects a month number no month answers to', async () => {
      await open('2026-13').expect(400);
      await open('2026-00').expect(400);
    });

    it('rejects a year outside the range a budget is about, rather than failing deeper in', async () => {
      for (const month of ['9999-12', '0500-01', '0999-12', '3000-01', '1899-12']) {
        await open(month).expect(400);
      }
    });

    it('rejects anything that is not the year-month shape', async () => {
      for (const month of ['2026-2', '202602', '2026-02-01', '2026', '', ' 2026-02 ']) {
        await open(month).expect(400);
      }
    });

    it('rejects a missing month, because the screen never means "whichever"', async () => {
      await open().expect(400);
    });

    it('says which field failed, without leaking internals', async () => {
      const response = await open('2026-13').expect(400);

      expect(JSON.stringify(response.body)).toContain('month');
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

    it('publishes a month as a string carrying the shape the pipe enforces', () => {
      expect(document.components?.schemas?.['PageResponse']).toMatchObject({
        required: ['month'],
        properties: {
          month: {
            type: 'string',
            pattern: '^(19\\d{2}|2\\d{3})-(0[1-9]|1[0-2])$',
            example: '2026-02',
          },
        },
      });
    });

    it('carries the caller-supplied description onto the query parameter', () => {
      const parameter = document.paths['/pages']?.get?.parameters?.[0];

      expect(parameter).toMatchObject({
        name: 'month',
        in: 'query',
        required: true,
        description: 'The month the screen is showing.',
        schema: { pattern: '^(19\\d{2}|2\\d{3})-(0[1-9]|1[0-2])$' },
      });
    });
  });
});
