import { type OpenAPIObject, type PathItemObject } from '@nestjs/swagger';
import { MONEY_PATTERN } from '@rondo/types';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { HTTP_METHODS, SESSION_TOKEN_SCHEME } from '@/openapi/document';
import { generateOpenApiDocument } from '@/openapi/generate';

describe('OpenAPI document', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await generateOpenApiDocument();
  });

  it('describes the endpoints the app actually serves', () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      '/accounts',
      '/budget-view',
      '/budgets',
      '/health',
      '/me',
      '/user-settings',
    ]);
  });

  it('gives every response a schema, so a client is typed rather than guessing', () => {
    expect(document.components?.schemas).toHaveProperty('CurrentUserResponse');
    expect(document.components?.schemas).toHaveProperty('HealthResponse');
    expect(document.components?.schemas).toHaveProperty('UserSettingsResponse');
    expect(document.components?.schemas).toHaveProperty('BudgetResponse');
    expect(document.components?.schemas).toHaveProperty('AccountResponse');
    expect(document.components?.schemas).toHaveProperty('BadRequestResponse');
    expect(document.paths['/me']?.get?.responses['200']).toBeDefined();
  });

  it('names the language enum, so clients get a union type instead of a bare string', () => {
    expect(document.components?.schemas).toHaveProperty('LanguageTag');
    expect(document.components?.schemas?.['LanguageTag']).toMatchObject({
      enum: ['ru', 'en', 'pl'],
    });
  });

  it('names the account type enum, so clients get a union type instead of a bare string', () => {
    expect(document.components?.schemas).toHaveProperty('AccountType');
    expect(document.components?.schemas?.['AccountType']).toMatchObject({
      enum: ['CASH', 'DEBIT'],
    });
  });

  it('publishes a bad request body that covers both the pipe and the domain', () => {
    expect(document.components?.schemas?.['BadRequestResponse']).toMatchObject({
      properties: {
        message: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
      },
    });
  });

  it('publishes a bad request shape wherever the pipe can answer with one', () => {
    // Every operation taking a body or a query is validated by the global pipe, so 400 is
    // answerable whatever the handler itself does, and an undocumented status collapses that
    // operation's whole error type to `unknown` in the generated client. A query counts
    // because the DTO behind it is refused before the handler runs, exactly like a body.
    const typed = (response: unknown): boolean => {
      const schema =
        response && typeof response === 'object' && 'content' in response
          ? ((response.content as Record<string, { schema?: { $ref?: string } }> | undefined)?.[
              'application/json'
            ]?.schema?.$ref ?? '')
          : '';

      return schema.endsWith('/BadRequestResponse');
    };

    const validated = (method: (typeof HTTP_METHODS)[number], item: PathItemObject): boolean =>
      Boolean(item[method]?.requestBody) ||
      (item[method]?.parameters ?? []).some(
        (parameter) => 'in' in parameter && parameter.in === 'query',
      );

    const undocumented = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.filter(
        (method) => validated(method, item) && !typed(item[method]?.responses['400']),
      ).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(undocumented).toEqual([]);
  });

  it('publishes the refusal of an undeclared field, which the pipe already performs', () => {
    // Stated only in the description, a generated client would build a body the server answers
    // 400 for. Response schemas stay open: a client meeting a field it does not know is fine.
    const open = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => {
        const body = item[method]?.requestBody;
        if (!body) return false;

        const reference = 'content' in body ? body.content['application/json']?.schema : undefined;
        const name = reference && '$ref' in reference ? reference.$ref.split('/').pop() : undefined;

        const schema = name === undefined ? undefined : document.components?.schemas?.[name];

        return (
          schema === undefined || !('properties' in schema) || schema.additionalProperties !== false
        );
      }).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(open).toEqual([]);
    expect(document.components?.schemas?.['AccountResponse']).not.toHaveProperty(
      'additionalProperties',
    );
  });

  it('describes each parameter once, whatever the case it is written in', () => {
    const duplicates = Object.entries(document.paths).flatMap(([path, pathItem]) =>
      HTTP_METHODS.flatMap((method) => {
        const seen = new Set<string>();

        return (pathItem[method]?.parameters ?? [])
          .map((parameter) =>
            'name' in parameter ? `${parameter.in}:${parameter.name.toLowerCase()}` : null,
          )
          .filter((key): key is string => key !== null)
          .filter((key) => {
            const repeated = seen.has(key);
            seen.add(key);
            return repeated;
          })
          .map((key) => `${method.toUpperCase()} ${path} — ${key}`);
      }),
    );

    expect(duplicates).toEqual([]);
  });

  describe('security', () => {
    it('declares the Clerk session token as a bearer scheme', () => {
      expect(document.components?.securitySchemes?.[SESSION_TOKEN_SCHEME]).toMatchObject({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });

    it('requires that token by default, mirroring the global guard', () => {
      expect(document.security).toEqual([{ [SESSION_TOKEN_SCHEME]: [] }]);
    });

    it('leaves a protected endpoint on the default requirement', () => {
      expect(document.paths['/me']?.get?.security).toBeUndefined();
    });

    it('exempts a @Public() endpoint, and says so in the spec', () => {
      const health = document.paths['/health']?.get;

      expect(health?.security).toEqual([]);
      expect(health && PUBLIC_OPERATION_EXTENSION in health).toBe(true);
    });
  });

  describe('currency', () => {
    it('publishes the shape of a code rather than the list of them', () => {
      const body = document.components?.schemas?.['CreateBudgetDto'];
      const currency = body && 'properties' in body ? body.properties?.['currency'] : undefined;

      expect(currency).toMatchObject({ type: 'string', pattern: '^[A-Z]{3}$' });
      expect(currency).not.toHaveProperty('enum');
    });

    it('is accepted by no operation other than creating a budget, because it never changes', () => {
      const accepting = Object.entries(document.paths).flatMap(([path, pathItem]) =>
        HTTP_METHODS.filter((method) => {
          const requestBody = pathItem[method]?.requestBody;
          if (!requestBody || !('content' in requestBody)) return false;

          return Object.values(requestBody.content ?? {}).some((media) => {
            const schema = media.schema;
            const name = schema && '$ref' in schema ? schema.$ref?.split('/').pop() : undefined;
            const resolved = name ? document.components?.schemas?.[name] : schema;

            return Boolean(
              resolved && 'properties' in resolved && resolved.properties?.['currency'],
            );
          });
        }).map((method) => `${method.toUpperCase()} ${path}`),
      );

      expect(accepting).toEqual(['POST /budgets']);
    });
  });

  describe('the budget view', () => {
    it('takes the month as a query parameter carrying the shape the pipe enforces', () => {
      const parameter = document.paths['/budget-view']?.get?.parameters?.find(
        (candidate) => 'name' in candidate && candidate.name === 'month',
      );

      expect(parameter).toMatchObject({
        in: 'query',
        required: true,
        schema: { type: 'string', pattern: '^(19\\d{2}|2\\d{3})-(0[1-9]|1[0-2])$' },
      });
    });

    it('publishes every amount it answers with as a string of minor units', () => {
      const moneyOf = (name: string): string[] => {
        const schema = document.components?.schemas?.[name];
        const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

        return Object.entries(properties)
          .filter(
            ([, property]) => 'pattern' in property && property.pattern === MONEY_PATTERN.source,
          )
          .map(([field]) => field);
      };

      expect(moneyOf('BudgetViewResponse')).toEqual(['readyToAssign']);
      expect(moneyOf('BudgetViewCategoryResponse').sort()).toEqual([
        'activity',
        'assigned',
        'available',
      ]);
    });
  });

  it('states the money convention, since the contract is published before any amount is', () => {
    expect(document.info.description).toContain('minor units');
    expect(document.info.description).toContain('packages/types/src/money.ts');
  });

  it('states the convention for money coming in, not only going out', () => {
    const description = document.info.description ?? '';

    expect(description).toContain('an amount **sent** to this API is the same string');
    expect(description).toContain('is a JSON number');
    expect(description).toContain('rejected with 400');
    expect(description).toContain('no leading zeros and no `-0`');
  });
});
