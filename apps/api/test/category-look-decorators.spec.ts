import { type Server } from 'node:http';

import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@rondo/types';
import request from 'supertest';

import { ApiCategoryColorProperty } from '@/validation/color.decorator';
import { ApiCategoryIconProperty } from '@/validation/icon.decorator';
import { VALIDATION_PIPE } from '@/validation/validation.options';

class LookBody {
  @ApiCategoryIconProperty({ description: 'Which icon this category is drawn with.' })
  icon!: string;

  @ApiCategoryColorProperty({ description: 'Which colour this category is drawn in.' })
  color!: string;
}

class LookResponse {
  @ApiCategoryIconProperty()
  icon!: string;

  @ApiCategoryColorProperty()
  color!: string;
}

@Controller('looks')
class LooksController {
  @Post()
  @ApiOkResponse({ type: LookResponse })
  set(@Body() body: LookBody): LookResponse {
    return { icon: body.icon, color: body.color };
  }
}

describe('a category look at the API boundary', () => {
  let app: INestApplication;

  const set = (body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/looks')
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LooksController],
      providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('input', () => {
    it('accepts every name the app draws', async () => {
      for (const icon of CATEGORY_ICONS) {
        await set({ icon, color: 'blue' }).expect(201);
      }

      for (const color of CATEGORY_COLORS) {
        await set({ icon: 'home', color }).expect(201);
      }
    });

    it('rejects a name outside the set, so a stored value is always drawable', async () => {
      await set({ icon: 'unicorn', color: 'blue' }).expect(400);
      await set({ icon: 'home', color: 'chartreuse' }).expect(400);
    });

    it('rejects the library spelling of an icon, which is not the domain name', async () => {
      await set({ icon: 'IconHome', color: 'blue' }).expect(400);
      await set({ icon: 'device-mobile', color: 'blue' }).expect(400);
    });

    it('rejects a value that is not a string at all', async () => {
      await set({ icon: 1, color: 'blue' }).expect(400);
      await set({ icon: 'home', color: null }).expect(400);
      await set({ icon: ['home'], color: 'blue' }).expect(400);
    });

    it('says which field failed, without leaking internals', async () => {
      const response = await set({ icon: 'unicorn', color: 'blue' }).expect(400);

      expect(JSON.stringify(response.body)).toContain('icon');
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

    const propertyOf = (schema: string, field: string): string =>
      JSON.stringify(
        (() => {
          const published = document.components?.schemas?.[schema];

          return published && 'properties' in published ? published.properties?.[field] : undefined;
        })(),
      );

    it('publishes the whole icon set as one named vocabulary, because the names are ours', () => {
      expect(document.components?.schemas?.['CategoryIcon']).toMatchObject({
        enum: [...CATEGORY_ICONS],
      });
      expect(propertyOf('LookBody', 'icon')).toContain('#/components/schemas/CategoryIcon');
    });

    it('publishes the whole colour set the same way', () => {
      expect(document.components?.schemas?.['CategoryColor']).toMatchObject({
        enum: [...CATEGORY_COLORS],
      });
      expect(propertyOf('LookBody', 'color')).toContain('#/components/schemas/CategoryColor');
    });

    it('carries the caller-supplied description, and publishes the response fields too', () => {
      expect(propertyOf('LookBody', 'icon')).toContain('Which icon this category is drawn with.');
      expect(propertyOf('LookResponse', 'icon')).toContain('#/components/schemas/CategoryIcon');
      expect(propertyOf('LookResponse', 'color')).toContain('#/components/schemas/CategoryColor');
    });
  });
});
