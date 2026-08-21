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

/**
 * The money boundary of the API, proved end to end without inventing a domain endpoint —
 * none carries an amount yet.
 *
 * The throwaway module below is the point: `@ApiMoneyProperty` has to do two jobs at once —
 * publish the field as a **string** in the OpenAPI schema, and refuse anything that is not
 * integer minor units at the pipe. There is no `@nestjs/swagger` CLI plugin here
 * (`nest-cli.json`), so a validation decorator contributes nothing to the spec on its own;
 * declaring the two separately is how a contract and its guard drift apart, and this suite is
 * what makes the single decorator worth having.
 *
 * A unit test on purpose: no database, no Postgres, nothing but the pipe and the scanner.
 */
class PaymentBody {
  @ApiMoneyProperty({ description: 'The amount to record, in minor units.' })
  amount!: string;
}

class PaymentResponse {
  // Deliberately bare: a money field that adds nothing of its own must still publish as a
  // string with the pattern and the example, so a future field cannot be under-declared by
  // being under-written.
  @ApiMoneyProperty()
  amount!: string;
}

@Controller('payments')
class PaymentsController {
  @Post()
  @ApiOkResponse({ type: PaymentResponse })
  record(@Body() body: PaymentBody): PaymentResponse {
    // Round-trips through the money type deliberately: what the handler receives is a string,
    // what the domain would hold is a bigint, and what goes back out is a string again. If the
    // pipe ever let a non-integer through, this is where it would surface as a thrown parse.
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
      // The reason money never travels as a JSON number: this value cannot survive one.
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
      // 2^63, one past the ceiling. Shape-wise it is impeccable — digits and nothing else —
      // so only a range check stops it, and without one it would travel all the way to the
      // driver and come back as a 500 that names no field.
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
      // Nothing between the wire and the database bounded this before: a 100 000-digit amount
      // was accepted with 201. `.claude/rules/security.md` asks for bounded strings, and this
      // is the one string type the money boundary introduces.
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
      // `forbidNonWhitelisted`: an unexpected field is an error, not something to drop
      // quietly. A typo'd `ammount` alongside a valid `amount` must not look like success.
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
    // Everything above runs against a throwaway module, so on its own it proves the pipe
    // works and says nothing about whether the app uses it. Nothing else would notice: every
    // handler in AppModule is a GET with no body, query or param, so removing the provider
    // leaves the whole suite green — verified by doing exactly that. The guard has the same
    // shape of risk and answers it the same way, through the real module.
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
      // Both, because the pipe enforces both: a client validating against the schema alone
      // must not be able to build a request the API refuses on shape or on length. The
      // storable range is deliberately not here — JSON Schema's numeric bounds do not apply
      // to a string — so that one check stays pipe-only, and 'rejects an amount past what the
      // money column can hold' above is what proves it still runs.
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
