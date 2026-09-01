import { type OpenAPIObject, type PathItemObject } from '@nestjs/swagger';
import {
  ACCOUNT_REFUSALS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  MONEY_PATTERN,
  MONEY_POSITIVE_PATTERN,
  MOVE_REFUSALS,
  TRANSACTION_REFUSALS,
  TRANSFER_REFUSALS,
} from '@rondo/types';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { HTTP_METHODS, SESSION_TOKEN_SCHEME } from '@/openapi/document';
import { generateOpenApiDocument } from '@/openapi/generate';

type Operation = NonNullable<PathItemObject['post']>;

type Schema = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];

const referencedName = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  if ('$ref' in value && typeof value.$ref === 'string') {
    return value.$ref.split('/').pop();
  }

  if ('allOf' in value && Array.isArray(value.allOf)) {
    for (const member of value.allOf) {
      const name = referencedName(member);
      if (name !== undefined) {
        return name;
      }
    }
  }

  return undefined;
};

const schemaNamed = (document: OpenAPIObject, name: string | undefined): Schema | undefined =>
  name === undefined ? undefined : document.components?.schemas?.[name];

const moneyFieldsOf = (document: OpenAPIObject, name: string): string[] => {
  const schema = document.components?.schemas?.[name];
  const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

  return Object.entries(properties)
    .filter(([, property]) => 'pattern' in property && property.pattern === MONEY_PATTERN.source)
    .map(([field]) => field);
};

const requestSchemaOf = (document: OpenAPIObject, operation?: Operation): Schema | undefined => {
  const body = operation?.requestBody;
  const content = body && 'content' in body ? body.content['application/json']?.schema : undefined;

  return schemaNamed(document, referencedName(content));
};

const responseSchemaOf = (response: unknown): { $ref?: string } | undefined =>
  response && typeof response === 'object' && 'content' in response
    ? (response.content as Record<string, { schema?: { $ref?: string } }> | undefined)?.[
        'application/json'
      ]?.schema
    : undefined;

const answersWith = (response: unknown, name: string): boolean =>
  (responseSchemaOf(response)?.$ref ?? '').endsWith(`/${name}`);

const fieldsOf = (document: OpenAPIObject, schema: Schema | undefined): Set<string> => {
  const named = new Set<string>();
  if (schema === undefined) {
    return named;
  }

  for (const field of Object.keys('properties' in schema ? (schema.properties ?? {}) : {})) {
    named.add(field);
  }

  if ('allOf' in schema && Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      for (const field of fieldsOf(document, schemaNamed(document, referencedName(member)))) {
        named.add(field);
      }
    }
  }

  return named;
};

const carriesTheShapeOf = (document: OpenAPIObject, response: unknown, name: string): boolean => {
  const answered = schemaNamed(document, referencedName(responseSchemaOf(response)));
  if (answered === undefined) {
    return false;
  }

  const wanted = fieldsOf(document, document.components?.schemas?.[name]);
  const carried = fieldsOf(document, answered);

  return [...wanted].every((field) => carried.has(field));
};

const nestedSchemaNames = (
  document: OpenAPIObject,
  schema: Schema | undefined,
  visited: Set<string> = new Set(),
): Set<string> => {
  if (schema === undefined || !('properties' in schema)) {
    return visited;
  }

  for (const property of Object.values(schema.properties ?? {})) {
    const name =
      referencedName(property) ??
      (typeof property === 'object' && property !== null && 'items' in property
        ? referencedName(property.items)
        : undefined);

    if (name !== undefined && !visited.has(name)) {
      visited.add(name);
      nestedSchemaNames(document, schemaNamed(document, name), visited);
    }
  }

  return visited;
};

function membersOf(document: OpenAPIObject, name: string): string[] {
  const schema = document.components?.schemas?.[name];
  const members = schema && 'enum' in schema ? schema.enum : [];

  return Array.isArray(members) ? members.map((member) => String(member)) : [];
}

describe('OpenAPI document', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await generateOpenApiDocument();
  });

  it('describes the endpoints the app actually serves', () => {
    expect(Object.keys(document.paths).sort()).toEqual([
      '/accounts',
      '/accounts/{id}',
      '/accounts/{id}/archive',
      '/accounts/{id}/opening-balance',
      '/budget-view',
      '/budgets',
      '/categories',
      '/categories/reorder',
      '/categories/{id}',
      '/categories/{id}/hide',
      '/categories/{id}/target',
      '/categories/{id}/target/close',
      '/categories/{id}/unhide',
      '/category-groups',
      '/category-groups/reorder',
      '/category-groups/{id}',
      '/category-groups/{id}/hide',
      '/category-groups/{id}/unhide',
      '/health',
      '/me',
      '/moves',
      '/transactions',
      '/transactions/payees',
      '/transactions/{id}',
      '/transactions/{id}/delete',
      '/transfers',
      '/transfers/{transferId}',
      '/transfers/{transferId}/delete',
      '/user-settings',
    ]);
  });

  it('publishes no operation under the delete verb, because a key travels in the body', () => {
    const deleting = Object.entries(document.paths).filter(([, item]) => item?.delete);

    expect(deleting.map(([path]) => path)).toEqual([]);
  });

  it('gives every response a schema, so a client is typed rather than guessing', () => {
    expect(document.components?.schemas).toHaveProperty('CurrentUserResponse');
    expect(document.components?.schemas).toHaveProperty('HealthResponse');
    expect(document.components?.schemas).toHaveProperty('UserSettingsResponse');
    expect(document.components?.schemas).toHaveProperty('BudgetResponse');
    expect(document.components?.schemas).toHaveProperty('AccountResponse');
    expect(document.components?.schemas).toHaveProperty('MoveResponse');
    expect(document.components?.schemas).toHaveProperty('MoveSideResponse');
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

  it('names the move side enum, so clients get a union type instead of a bare string', () => {
    expect(document.components?.schemas).toHaveProperty('MoveSideKind');
    expect(document.components?.schemas?.['MoveSideKind']).toMatchObject({
      enum: ['CATEGORY', 'READY_TO_ASSIGN'],
    });
  });

  it('names the category look enums, so a screen gets a union rather than any string', () => {
    expect(document.components?.schemas?.['CategoryIcon']).toMatchObject({
      enum: [...CATEGORY_ICONS],
    });
    expect(document.components?.schemas?.['CategoryColor']).toMatchObject({
      enum: [...CATEGORY_COLORS],
    });
  });

  it('names the refusal enum, so a screen answers each refusal without reading the message', () => {
    expect(document.components?.schemas?.['MoveRefusal']).toMatchObject({
      enum: [...MOVE_REFUSALS],
    });
    expect(document.components?.schemas?.['TransferRefusal']).toMatchObject({
      enum: [...TRANSFER_REFUSALS],
    });
    expect(document.components?.schemas?.['AccountRefusal']).toMatchObject({
      enum: [...ACCOUNT_REFUSALS],
    });
  });

  it('publishes the conflict wherever an idempotency key can be claimed twice', () => {
    const undocumented = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => {
        const schema = requestSchemaOf(document, item[method]);
        const takesKey =
          schema !== undefined &&
          'properties' in schema &&
          'idempotencyKey' in (schema.properties ?? {});

        return takesKey && !answersWith(item[method]?.responses['409'], 'ConflictResponse');
      }).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(undocumented).toEqual([]);
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

  it('publishes the bad request shape wherever the pipe can answer with one', () => {
    const validated = (method: (typeof HTTP_METHODS)[number], item: PathItemObject): boolean =>
      Boolean(item[method]?.requestBody) ||
      (item[method]?.parameters ?? []).some(
        (parameter) => 'in' in parameter && parameter.in === 'query',
      );

    const undocumented = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.filter(
        (method) =>
          validated(method, item) &&
          !carriesTheShapeOf(document, item[method]?.responses['400'], 'BadRequestResponse'),
      ).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(undocumented).toEqual([]);
  });

  it('publishes the refusal of an undeclared field, which the pipe already performs', () => {
    const open = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => {
        const body = item[method]?.requestBody;
        if (!body) return false;

        const schema = requestSchemaOf(document, item[method]);

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

  it('refuses an undeclared field inside a nested body object too', () => {
    const open = Object.entries(document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.flatMap((method) =>
        [...nestedSchemaNames(document, requestSchemaOf(document, item[method]))]
          .filter((name) => {
            const schema = schemaNamed(document, name);

            return (
              schema !== undefined &&
              'properties' in schema &&
              schema.additionalProperties !== false
            );
          })
          .map((name) => `${method.toUpperCase()} ${path} > ${name}`),
      ),
    );

    expect(open).toEqual([]);
  });

  it('closes every request DTO, whatever shape the body referred to it through', () => {
    const named = Object.entries(document.components?.schemas ?? {}).filter(([name]) =>
      name.endsWith('Dto'),
    );

    expect(named.length).toBeGreaterThan(0);

    const open = named
      .filter(([, schema]) => 'properties' in schema && schema.additionalProperties !== false)
      .map(([name]) => name);

    expect(open).toEqual([]);
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
      expect(moneyFieldsOf(document, 'BudgetViewResponse')).toEqual(['readyToAssign']);
      expect(moneyFieldsOf(document, 'BudgetViewCategoryResponse').sort()).toEqual([
        'activity',
        'assigned',
        'available',
        'availableAllTime',
      ]);
    });

    it('publishes the look of a category as the named vocabularies, nullable and always present', () => {
      const schema = document.components?.schemas?.['BudgetViewCategoryResponse'];
      const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};
      const required = schema && 'required' in schema ? (schema.required ?? []) : [];

      for (const [field, name] of [
        ['icon', 'CategoryIcon'],
        ['color', 'CategoryColor'],
      ] as const) {
        expect(required).toContain(field);
        expect(JSON.stringify(properties[field])).toContain(`#/components/schemas/${name}`);
        expect(JSON.stringify(properties[field])).toContain('"nullable":true');
      }
    });
  });

  describe('the accounts screen', () => {
    it('publishes every amount it answers with as a string of minor units', () => {
      expect(moneyFieldsOf(document, 'AccountsResponse')).toEqual(['total']);
      expect(moneyFieldsOf(document, 'AccountBalanceResponse')).toEqual(['balance']);
    });

    it('publishes the amount that blocked an archive as a string of minor units too', () => {
      expect(moneyFieldsOf(document, 'AccountRefusedResponse')).toEqual(['balance']);
    });

    it('takes nothing but the key when an account is archived, because there is nothing to choose', () => {
      const schema = requestSchemaOf(document, document.paths['/accounts/{id}/archive']?.post);
      const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

      expect(Object.keys(properties).sort()).toEqual(['idempotencyKey']);
    });

    it('publishes no way back, because an account is archived once and for good', () => {
      const reversing = Object.keys(document.paths).filter((path) =>
        /unarchive|restore|reopen/i.test(path),
      );

      expect(reversing).toEqual([]);
    });

    it('takes nothing but an amount when an opening balance is corrected', () => {
      const schema = requestSchemaOf(
        document,
        document.paths['/accounts/{id}/opening-balance']?.patch,
      );
      const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

      expect(Object.keys(properties).sort()).toEqual(['amount', 'idempotencyKey']);
    });

    it('takes nothing but a name when an account is renamed, because the type never changes', () => {
      const schema = requestSchemaOf(document, document.paths['/accounts/{id}']?.patch);
      const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

      expect(Object.keys(properties).sort()).toEqual(['idempotencyKey', 'name']);
    });
  });

  describe('a transfer', () => {
    it('takes the two accounts, the amount, the day and the key, and nothing else', () => {
      const schema = requestSchemaOf(document, document.paths['/transfers']?.post);
      const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

      expect(Object.keys(properties).sort()).toEqual([
        'amount',
        'date',
        'fromAccountId',
        'idempotencyKey',
        'toAccountId',
      ]);
    });

    it('answers the reason beside the message, and never as the message', () => {
      const refused = document.paths['/transfers']?.post?.responses['400'];
      const schema =
        refused && 'content' in refused ? refused.content?.['application/json']?.schema : undefined;

      expect(JSON.stringify(schema)).toContain('TransferRefusedResponse');

      const shape = document.components?.schemas?.['TransferRefusedResponse'];
      const properties = shape && 'properties' in shape ? (shape.properties ?? {}) : {};
      const required = shape && 'required' in shape ? (shape.required ?? []) : [];

      expect(JSON.stringify(properties['reason'])).toContain(
        '#/components/schemas/TransferRefusal',
      );
      expect(required).not.toContain('reason');
      expect(required).toContain('message');
    });
  });

  describe('a refused move', () => {
    it('answers the reason beside the message, and never as the message', () => {
      const refused = document.paths['/moves']?.post?.responses['400'];
      const schema =
        refused && 'content' in refused ? refused.content?.['application/json']?.schema : undefined;

      expect(JSON.stringify(schema)).toContain('MoveRefusedResponse');

      const shape = document.components?.schemas?.['MoveRefusedResponse'];
      const properties = shape && 'properties' in shape ? (shape.properties ?? {}) : {};
      const required = shape && 'required' in shape ? (shape.required ?? []) : [];

      expect(JSON.stringify(properties['reason'])).toContain('#/components/schemas/MoveRefusal');
      expect(required).not.toContain('reason');
      expect(required).toContain('message');
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

  it('publishes the goal a category carries, with the two month-only amounts optional', () => {
    const required = (schema: unknown): string[] => {
      const value = (schema as { required?: unknown } | undefined)?.required;

      return Array.isArray(value)
        ? value.filter((one): one is string => typeof one === 'string')
        : [];
    };

    const category = document.components?.schemas?.['BudgetViewCategoryResponse'];
    const goal = document.components?.schemas?.['BudgetViewTargetResponse'];

    expect(required(category)).toContain('target');

    for (const field of ['kind', 'amount', 'startMonth', 'progress', 'remaining']) {
      expect(required(goal)).toContain(field);
    }

    for (const field of ['monthTarget', 'needed', 'dueMonth']) {
      expect(required(goal)).not.toContain(field);
    }
  });

  describe('the transactions screen', () => {
    it('publishes every amount it answers with as a string of minor units', () => {
      expect(moneyFieldsOf(document, 'TransactionResponse')).toEqual(['amount']);
      expect(moneyFieldsOf(document, 'TransactionDayResponse')).toEqual(['total']);
    });

    it('takes an amount without a sign, because the direction is the type', () => {
      const schema = requestSchemaOf(document, document.paths['/transactions']?.post);
      const properties = schema && 'properties' in schema ? (schema.properties ?? {}) : {};

      expect(properties['amount']).toMatchObject({ pattern: MONEY_POSITIVE_PATTERN.source });
    });

    it('publishes the kinds a form may send apart from the kinds a row may be', () => {
      expect(membersOf(document, 'TransactionEntryType')).toEqual(['INCOME', 'EXPENSE']);
      expect(membersOf(document, 'TransactionType').sort()).toEqual([
        'ADJUSTMENT',
        'EXPENSE',
        'INCOME',
        'TRANSFER',
      ]);
    });

    it('names the reason a refusal carries, so a screen answers each one differently', () => {
      expect(membersOf(document, 'TransactionRefusal').sort()).toEqual(
        [...TRANSACTION_REFUSALS].sort(),
      );
    });
  });
});
