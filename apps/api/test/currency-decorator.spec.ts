import { type Server } from 'node:http';

import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ApiCurrencyProperty } from '@/validation/currency.decorator';
import { VALIDATION_PIPE } from '@/validation/validation.options';

class WalletBody {
  @ApiCurrencyProperty({ description: 'The currency this wallet holds.' })
  currency!: string;
}

class WalletResponse {
  @ApiCurrencyProperty()
  currency!: string;
}

@Controller('wallets')
class WalletsController {
  @Post()
  @ApiOkResponse({ type: WalletResponse })
  open(@Body() body: WalletBody): WalletResponse {
    return { currency: body.currency };
  }
}

describe('a currency at the API boundary', () => {
  let app: INestApplication;

  const open = (body: Record<string, unknown>) =>
    request(app.getHttpServer() as Server)
      .post('/wallets')
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('input', () => {
    it('accepts a currency the runtime knows', async () => {
      await open({ currency: 'PLN' }).expect(201, { currency: 'PLN' });
      await open({ currency: 'JPY' }).expect(201, { currency: 'JPY' });
    });

    it('rejects a well-formed code no currency answers to, which a regex would let through', async () => {
      await open({ currency: 'ZZZ' }).expect(400);
      await open({ currency: 'AAA' }).expect(400);
    });

    it('rejects a malformed code', async () => {
      for (const currency of ['usd', 'US', 'USDD', 'U5D', '', ' USD ']) {
        await open({ currency }).expect(400);
      }
    });

    it('rejects a currency that is not a string at all', async () => {
      await open({ currency: 840 }).expect(400);
      await open({ currency: null }).expect(400);
      await open({ currency: ['USD'] }).expect(400);
    });

    it('rejects a missing currency', async () => {
      await open({}).expect(400);
    });

    it('says which field failed, without leaking internals', async () => {
      const response = await open({ currency: 'ZZZ' }).expect(400);

      expect(JSON.stringify(response.body)).toContain('currency');
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

    it('publishes a currency as a string carrying the shape a client must send', () => {
      expect(document.components?.schemas?.['WalletBody']).toMatchObject({
        required: ['currency'],
        properties: { currency: { type: 'string', pattern: '^[A-Z]{3}$', example: 'PLN' } },
      });
    });

    it('publishes no enum of codes, so a runtime upgrade cannot rewrite the committed spec', () => {
      const published = document.components?.schemas?.['WalletBody'];
      const currency =
        published && 'properties' in published ? published.properties?.['currency'] : undefined;

      expect(currency).not.toHaveProperty('enum');
    });

    it('carries the caller-supplied description, and publishes the response field too', () => {
      expect(document.components?.schemas?.['WalletBody']).toMatchObject({
        properties: { currency: { description: 'The currency this wallet holds.' } },
      });
      expect(document.components?.schemas?.['WalletResponse']).toMatchObject({
        properties: { currency: { type: 'string', pattern: '^[A-Z]{3}$' } },
      });
    });
  });
});
