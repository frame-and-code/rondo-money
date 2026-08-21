import { type INestApplication } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { resolveEnvironment } from '@/environment';

/**
 * The name of the bearer scheme in the spec. Generated clients use it to look the scheme up,
 * so renaming it is a breaking change to the contract, not a cosmetic edit.
 */
export const SESSION_TOKEN_SCHEME = 'clerkSessionToken';

/** Where the Swagger UI is mounted when it is served at all (see {@link areApiDocsEnabled}). */
export const API_DOCS_PATH = 'docs';

/**
 * Operations in the OpenAPI spec are addressed by HTTP method, and `PathItemObject` also
 * carries non-operation keys (`parameters`, `servers`, `$ref`). Listing the methods keeps the
 * walk below typed instead of casting whatever `Object.values` hands back.
 */
export const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

const DESCRIPTION = `The REST contract of Rondo Money — a zero-based budgeting app. The backend owns every
database access (ADR-002); this spec is what the typed client in \`packages/api-client\` is
generated from, so it is the contract itself rather than a description of one.

**Authentication.** Every endpoint requires a Clerk session token as
\`Authorization: Bearer <jwt>\`, except the ones marked \`x-public: true\` — today only the
platform healthcheck, which the deployment probes anonymously. The token must also carry an
\`azp\` claim equal to this API's configured web origin, so a token minted for another origin
cannot be replayed here.

**Money.** Amounts are an integer number of **minor units** (cents, kopeks, grosze), and the
number of minor digits comes from the budget's currency rather than a fixed 2 — 0 for JPY,
3 for BHD.
JSON has no bigint, so every money field crosses the wire as a base-10 **string**, in its
shortest form: digits with an optional leading \`-\`, no leading zeros and no \`-0\` — \`0\`,
\`-4500\`, \`120000\`. One amount therefore has exactly one spelling, which is also what lets a
money field publish a \`maxLength\` alongside its \`pattern\`. That applies in both directions:
an amount **sent** to this API is the same string, and one that is a JSON number, carries a
decimal point, uses exponent notation or pads itself with zeros is rejected with 400 rather
than rounded or quietly normalised into something plausible. So is one that falls outside the
range the money column holds — a signed 64-bit integer — which is the only rejection a client
cannot predict from the schema, because JSON Schema's numeric bounds do not apply to a string. The single definition of the convention, with its
serializer, its parser and the pattern published on every money field, is
\`packages/types/src/money.ts\`. No endpoint carries money yet; the convention is stated here
because the contract is published before the first amount travels over it.

**Request bodies** are validated against the schema published here: a field the schema does
not declare is an error, not something quietly ignored.`;

/**
 * The OpenAPI document for the whole app, built from the code itself.
 *
 * Shared by the generation script (which writes `openapi.json` for the codegen) and by
 * `main.ts` (which serves the Swagger UI), so the published file and the browsable
 * documentation cannot describe two different APIs.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Rondo Money API')
    .setDescription(DESCRIPTION)
    // Tracks apps/api/package.json. The API is not publicly versioned yet — when it is, this
    // is the number that carries the promise, so it is deliberately not "1.0.0" today.
    .setVersion('0.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'A Clerk session token. In the web app: `await getToken()`.',
      },
      SESSION_TOKEN_SCHEME,
    )
    // Required globally, mirroring the guard: the app is closed unless a handler says
    // otherwise, so the spec is too. `openPublicOperations` below then reopens exactly the
    // handlers that carry `@Public()`.
    .addSecurityRequirements(SESSION_TOKEN_SCHEME)
    .build();

  return openPublicOperations(SwaggerModule.createDocument(app, config));
}

/**
 * Clear the global bearer requirement on the operations `@Public()` marked.
 *
 * Needed because there is no decorator that can do it: `@ApiSecurity` only ever *appends* a
 * requirement, and an empty one cannot survive the scanner either — method metadata passes
 * through `omitBy(…, isEmpty)`, which drops an empty array before it reaches the document
 * (`@nestjs/swagger@11.4.7`, `dist/swagger-explorer.js`). So `@Public()` leaves a vendor
 * extension behind and the document is corrected here, once, instead of every public handler
 * repeating a second decorator that someone will eventually forget.
 *
 * The `x-public` marker is kept in the published spec on purpose: "this endpoint is open" is
 * worth saying out loud to whoever reads the contract.
 */
function openPublicOperations(document: OpenAPIObject): OpenAPIObject {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];

      if (operation && PUBLIC_OPERATION_EXTENSION in operation) {
        // An empty array is OpenAPI's "no security at all", and it overrides the document-level
        // requirement — omitting the key would inherit it instead.
        operation.security = [];
      }
    }
  }

  return document;
}

/**
 * Whether this instance serves the Swagger UI: everywhere except production.
 *
 * The spec itself is public — the repository is (ADR-003) and `openapi.json` is committed —
 * so what production withholds is not the contract but a live, anonymous "Try it out" console
 * against real data. Note that the UI is mounted by the HTTP adapter rather than as a
 * controller, which means the global `ClerkAuthGuard` never sees those routes: wherever it is
 * on, it is on for everyone.
 */
export function areApiDocsEnabled(config: ConfigService): boolean {
  return resolveEnvironment(config) !== 'production';
}
