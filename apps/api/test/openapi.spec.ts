import { type OpenAPIObject } from '@nestjs/swagger';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { HTTP_METHODS, SESSION_TOKEN_SCHEME } from '@/openapi/document';
import { generateOpenApiDocument } from '@/openapi/generate';

describe('OpenAPI document', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await generateOpenApiDocument();
  });

  it('describes the endpoints the app actually serves', () => {
    expect(Object.keys(document.paths).sort()).toEqual(['/health', '/me', '/user-settings']);
  });

  it('gives every response a schema, so a client is typed rather than guessing', () => {
    expect(document.components?.schemas).toHaveProperty('CurrentUserResponse');
    expect(document.components?.schemas).toHaveProperty('HealthResponse');
    expect(document.components?.schemas).toHaveProperty('UserSettingsResponse');
    expect(document.paths['/me']?.get?.responses['200']).toBeDefined();
  });

  it('names the language enum, so clients get a union type instead of a bare string', () => {
    expect(document.components?.schemas).toHaveProperty('LanguageTag');
    expect(document.components?.schemas?.['LanguageTag']).toMatchObject({
      enum: ['ru', 'en', 'pl'],
    });
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
