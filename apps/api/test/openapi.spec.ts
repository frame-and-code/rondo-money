import { type OpenAPIObject } from '@nestjs/swagger';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { HTTP_METHODS, SESSION_TOKEN_SCHEME } from '@/openapi/document';
import { generateOpenApiDocument } from '@/openapi/generate';

/**
 * The contract every generated client is built from (F1.4).
 *
 * That this lives in the **unit** suite is itself half the point: that suite runs with no
 * Postgres and, in CI, without `DATABASE_URL` in the task's environment at all (turbo runs in
 * strict env mode). So if the generator ever stops being able to describe the API without a
 * database — dropping preview mode is the way that happens — these tests are where it shows,
 * rather than in a deploy whose codegen step suddenly needs a connection string.
 */
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
    // `enumName` on the @ApiProperty is what lifts the enum into `components.schemas`; without
    // it the generated client types `language` as `string` and every screen needs a guard.
    expect(document.components?.schemas).toHaveProperty('LanguageTag');
    expect(document.components?.schemas?.['LanguageTag']).toMatchObject({
      enum: ['ru', 'en', 'pl'],
    });
  });

  it('describes each parameter once, whatever the case it is written in', () => {
    // HTTP header names are case-insensitive, so `Accept-Language` and `accept-language` are
    // one parameter — and OpenAPI forbids two entries sharing `name` + `in`. This is not
    // hypothetical: a handler carrying both `@Headers('accept-language')` and an `@ApiHeader`
    // named `Accept-Language` publishes both, one of them `required: true` against an optional
    // argument. Nothing else catches it — the client generator collapses the pair by name, so
    // the F1.5 drift gate stays green while the contract is wrong.
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
      // No operation-level `security` means the document-level one applies — which is what
      // makes "closed unless it says otherwise" true of the spec as well as the code.
      expect(document.paths['/me']?.get?.security).toBeUndefined();
    });

    it('exempts a @Public() endpoint, and says so in the spec', () => {
      const health = document.paths['/health']?.get;

      // An empty array is OpenAPI's "no security at all"; omitting the key would inherit the
      // document-level requirement and document the healthcheck as needing a token it does
      // not need — and the platform probes it anonymously.
      expect(health?.security).toEqual([]);
      // Presence is what `buildOpenApiDocument` keys off, and the marker stays in the
      // published spec on purpose: "this endpoint is open" is worth saying to a reader.
      expect(health && PUBLIC_OPERATION_EXTENSION in health).toBe(true);
    });
  });

  it('states the money convention, since the contract is published before any amount is', () => {
    // AC of F1.4: "money as a string over the wire" has to be visible in the spec itself, not
    // only in packages/types. PRD §7.1.
    expect(document.info.description).toContain('minor units');
    expect(document.info.description).toContain('packages/types/src/money.ts');
  });

  it('states the convention for money coming in, not only going out', () => {
    // A client reading only this document has to learn that an amount is sent as a string
    // too — the boundary rejects a JSON number, and a contract that mentioned only the
    // response side would make that rejection look like a bug.
    //
    // Asserted on the specific claims rather than on the words `sent` and `400`, which any
    // unrelated paragraph could supply: a description that stopped saying money travels in
    // both directions would still have passed that.
    const description = document.info.description ?? '';

    expect(description).toContain('an amount **sent** to this API is the same string');
    expect(description).toContain('is a JSON number');
    expect(description).toContain('rejected with 400');
    // The canonical form is what makes the published `maxLength` sound, so the document has to
    // say it rather than leave a client to discover it from a rejection.
    expect(description).toContain('no leading zeros and no `-0`');
  });
});
