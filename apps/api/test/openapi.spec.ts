import { type OpenAPIObject } from '@nestjs/swagger';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { SESSION_TOKEN_SCHEME } from '@/openapi/document';
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
    expect(Object.keys(document.paths).sort()).toEqual(['/health', '/me']);
  });

  it('gives every response a schema, so a client is typed rather than guessing', () => {
    expect(document.components?.schemas).toHaveProperty('CurrentUserResponse');
    expect(document.components?.schemas).toHaveProperty('HealthResponse');
    expect(document.paths['/me']?.get?.responses['200']).toBeDefined();
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
});
