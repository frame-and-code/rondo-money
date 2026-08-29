import { type Server } from 'node:http';

import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ApiOkResponse, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { MONEY_MAX, parseMoney, serializeMoney } from '@rondo/types';
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

class TopUpBody {
  @ApiMoneyProperty({ sign: 'nonNegative', description: 'The amount to add, in minor units.' })
  amount!: string;
}

class TransferBody {
  @ApiMoneyProperty({ sign: 'positive', description: 'The amount to move, in minor units.' })
  amount!: string;
}

class TipBody {
  @ApiMoneyProperty({ required: false, description: 'What was added on top, if anything.' })
  amount?: string;
}

@Controller('payments')
class PaymentsController {
  @Post()
  @ApiOkResponse({ type: PaymentResponse })
  record(@Body() body: PaymentBody): PaymentResponse {
    return { amount: serializeMoney(parseMoney(body.amount) * 2n) };
  }
}

@Controller('top-ups')
class TopUpsController {
  @Post()
  @ApiOkResponse({ type: PaymentResponse })
  record(@Body() body: TopUpBody): PaymentResponse {
    return { amount: body.amount };
  }
}

@Controller('tips')
class TipsController {
  @Post()
  @ApiOkResponse({ type: PaymentResponse })
  record(@Body() body: TipBody): PaymentResponse {
    return { amount: body.amount ?? '0' };
  }
}

@Controller('transfers')
class TransfersController {
  @Post()
  @ApiOkResponse({ type: PaymentResponse })
  record(@Body() body: TransferBody): PaymentResponse {
    return { amount: body.amount };
  }
}

describe('money at the API boundary', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController, TopUpsController, TransfersController, TipsController],
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

    it('rejects a negative amount on a field declared non-negative', async () => {
      await request(app.getHttpServer() as Server)
        .post('/top-ups')
        .send({ amount: '-1' })
        .expect(400);
    });

    it('takes zero and any positive amount on that same field', async () => {
      for (const amount of ['0', '4500']) {
        await request(app.getHttpServer() as Server)
          .post('/top-ups')
          .send({ amount })
          .expect(201, { amount });
      }
    });

    it('rejects zero on a field declared positive, which would write a row and move nothing', async () => {
      await request(app.getHttpServer() as Server)
        .post('/transfers')
        .send({ amount: '0' })
        .expect(400);
    });

    it('rejects a negative amount on that field, which is the same move reversed', async () => {
      await request(app.getHttpServer() as Server)
        .post('/transfers')
        .send({ amount: '-100' })
        .expect(400);
    });

    it('takes any amount above zero on that field, to both ends of the range', async () => {
      for (const amount of ['1', '4500', serializeMoney(MONEY_MAX)]) {
        await request(app.getHttpServer() as Server)
          .post('/transfers')
          .send({ amount })
          .expect(201, { amount });
      }
    });

    it('says a positive field cannot be zero, so the message states the bound it enforces', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/transfers')
        .send({ amount: '0' })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('above zero');
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

  describe('an amount a body may leave out', () => {
    const tip = (body: Record<string, unknown>) =>
      request(app.getHttpServer() as Server)
        .post('/tips')
        .send(body);

    it('accepts a body that leaves the amount out', async () => {
      await tip({}).expect(201, { amount: '0' });
    });

    it('still refuses a value that is there and malformed', async () => {
      await tip({ amount: '4.50' }).expect(400);
      await tip({ amount: 450 }).expect(400);
      await tip({ amount: null }).expect(400);
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

    it('publishes the unsigned pattern for a non-negative field, and the signed one beside it', () => {
      expect(document.components?.schemas?.['TopUpBody']).toMatchObject({
        properties: { amount: { pattern: '^(0|[1-9]\\d*)$', example: '4500' } },
      });
      expect(document.components?.schemas?.['PaymentBody']).toMatchObject({
        properties: { amount: { pattern: '^(0|-?[1-9]\\d*)$' } },
      });
    });

    it('publishes the positive pattern for a field declared positive, and an example above zero', () => {
      expect(document.components?.schemas?.['TransferBody']).toMatchObject({
        properties: { amount: { pattern: '^[1-9]\\d*$', example: '4500' } },
      });
    });

    it('keeps the field required, and carries the caller-supplied description', () => {
      expect(document.components?.schemas?.['PaymentBody']).toMatchObject({
        required: ['amount'],
        properties: { amount: { description: 'The amount to record, in minor units.' } },
      });
    });

    it('publishes an optional amount as optional, so the pipe and the schema agree', () => {
      const published = document.components?.schemas?.['TipBody'];
      const required = published && 'required' in published ? (published.required ?? []) : [];

      expect(required).not.toContain('amount');
      expect(published).toMatchObject({
        properties: { amount: { type: 'string', pattern: '^(0|-?[1-9]\\d*)$' } },
      });
    });

    it('publishes a usable example even when the field declares nothing of its own', () => {
      expect(document.components?.schemas?.['PaymentResponse']).toMatchObject({
        properties: { amount: { type: 'string', pattern: '^(0|-?[1-9]\\d*)$', example: '-4500' } },
      });
    });
  });
});
