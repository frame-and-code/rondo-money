import { type Server } from 'node:http';

import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { parseMoney, serializeMoney } from '@rondo/types';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { ApiMoneyProperty } from '@/validation/money.decorator';
import { VALIDATION_PIPE } from '@/validation/validation.options';

class PaymentBody {
  @ApiMoneyProperty({ description: 'The amount to record, in minor units.' })
  amount!: string;
}

class PaymentResponse {
  @ApiMoneyProperty()
  amount!: string;
}

@Controller('payments')
class PaymentsController {
  @Post()
  @ApiOkResponse({ type: PaymentResponse })
  record(@Body() body: PaymentBody): PaymentResponse {
    return { amount: serializeMoney(parseMoney(body.amount) * 2n) };
  }
}

describe('money at the API boundary', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: APP_PIPE, useValue: VALIDATION_PIPE }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('input', () => {
    it('accepts integer minor units as a string', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '-4500' })
        .expect(201, { amount: '-9000' });
    });

    it('accepts an amount beyond Number.MAX_SAFE_INTEGER without losing digits', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '9007199254740993' })
        .expect(201, { amount: '18014398509481986' });
    });

    it('rejects a decimal amount rather than truncating it', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '12.5' })
        .expect(400);
    });

    it('rejects exponent notation, padding and other near-misses', async () => {
      for (const amount of ['1e3', ' 12 ', '', '+12', '--5', 'abc', '1,250']) {
        await request(app.getHttpServer() as Server)
          .post('/payments')
          .send({ amount })
          .expect(400);
      }
    });

    it('rejects money sent as a JSON number, which is the silent-precision-loss case', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: 4500 })
        .expect(400);
    });

    it('rejects an amount past what the money column can hold', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '9223372036854775808' })
        .expect(400);

      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '-9223372036854775809' })
        .expect(400);
    });

    it('still accepts both ends of the range itself', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '4611686018427387903' })
        .expect(201, { amount: '9223372036854775806' });
    });

    it('rejects an absurdly long amount without parsing it', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '9'.repeat(100_000) })
        .expect(400);
    });

    it('rejects a padded amount, so one sum has one spelling on the wire', async () => {
      for (const amount of ['007', '-007', '00', '-0']) {
        await request(app.getHttpServer() as Server)
          .post('/payments')
          .send({ amount })
          .expect(400);
      }
    });

    it('rejects a missing amount', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({})
        .expect(400);
    });

    it('rejects a field the DTO never declared', async () => {
      await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '100', currency: 'USD' })
        .expect(400);
    });

    it('says which field failed, without leaking internals', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/payments')
        .send({ amount: '12.5' })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('amount');
      expect(JSON.stringify(response.body)).not.toMatch(/at .*\.ts:\d+|node_modules|\/Users\//);
    });
  });

  it('is the pipe the real application registers, not one this test wired up', () => {
    const providers: unknown = Reflect.getMetadata('providers', AppModule);

    expect(providers).toContainEqual({ provide: APP_PIPE, useValue: VALIDATION_PIPE });
  });

  describe('the published contract', () => {
    let document: OpenAPIObject;

    beforeAll(() => {
      document = SwaggerModule.createDocument(app, {
        openapi: '3.0.0',
        info: { title: 'test', version: '0' },
      });
    });

    it('publishes money as a string, in requests and responses alike', () => {
      for (const schema of ['PaymentBody', 'PaymentResponse']) {
        expect(document.components?.schemas?.[schema]).toMatchObject({
          properties: { amount: { type: 'string' } },
        });
      }
    });

    it('publishes the exact shape a client must send, as a pattern and a length', () => {
      expect(document.components?.schemas?.['PaymentBody']).toMatchObject({
        properties: { amount: { pattern: '^(0|-?[1-9]\\d*)$', maxLength: 20 } },
      });
    });

    it('keeps the field required, and carries the caller-supplied description', () => {
      expect(document.components?.schemas?.['PaymentBody']).toMatchObject({
        required: ['amount'],
        properties: { amount: { description: 'The amount to record, in minor units.' } },
      });
    });

    it('publishes a usable example even when the field declares nothing of its own', () => {
      expect(document.components?.schemas?.['PaymentResponse']).toMatchObject({
        properties: { amount: { type: 'string', pattern: '^(0|-?[1-9]\\d*)$', example: '-4500' } },
      });
    });
  });
});
