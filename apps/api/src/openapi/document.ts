import { type INestApplication } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { PUBLIC_OPERATION_EXTENSION } from '@/auth/public.decorator';
import { resolveEnvironment } from '@/environment';

export const SESSION_TOKEN_SCHEME = 'clerkSessionToken';

export const API_DOCS_PATH = 'docs';

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

const DESCRIPTION = `The REST contract of Rondo Money, a zero-based budgeting app. The backend owns every
database access (ADR-002); this spec is what the typed client in \`packages/api-client\` is
generated from, so it is the contract itself rather than a description of one.

**Authentication.** Every endpoint requires a Clerk session token as
\`Authorization: Bearer <jwt>\`, except the ones marked \`x-public: true\`. Today that is only the
platform healthcheck, which the deployment probes anonymously. The token must also carry an
\`azp\` claim equal to this API's configured web origin, so a token minted for another origin
cannot be replayed here.

**Money.** Amounts are an integer number of **minor units** (cents, kopeks, grosze), and the
number of minor digits comes from the budget's currency rather than a fixed 2: 0 for JPY,
3 for BHD.
JSON has no bigint, so every money field crosses the wire as a base-10 **string**, in its
shortest form: digits with an optional leading \`-\`, no leading zeros and no \`-0\`. So \`0\`,
\`-4500\`, \`120000\`. One amount therefore has exactly one spelling, which is also what lets a
money field publish a \`maxLength\` alongside its \`pattern\`. That applies in both directions:
an amount **sent** to this API is the same string, and one that is a JSON number, carries a
decimal point, uses exponent notation or pads itself with zeros is rejected with 400 rather
than rounded or quietly normalised into something plausible. So is one that falls outside the
range the money column holds (a signed 64-bit integer), which is the only rejection a client
cannot predict from the schema, because JSON Schema's numeric bounds do not apply to a string. The single definition of the convention, with its
serializer, its parser and the pattern published on every money field, is
\`packages/types/src/money.ts\`. A field that cannot hold less than nothing publishes the
non-negative form of the same pattern, so the bound is in the schema a client reads rather
than in prose beside it.

**Request bodies** are validated against the schema published here: a field the schema does
not declare is an error, not something quietly ignored.`;

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Rondo Money API')
    .setDescription(DESCRIPTION)
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
    .addSecurityRequirements(SESSION_TOKEN_SCHEME)
    .build();

  return openPublicOperations(SwaggerModule.createDocument(app, config));
}

function openPublicOperations(document: OpenAPIObject): OpenAPIObject {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];

      if (operation && PUBLIC_OPERATION_EXTENSION in operation) {
        operation.security = [];
      }
    }
  }

  return document;
}

export function areApiDocsEnabled(config: ConfigService): boolean {
  return resolveEnvironment(config) !== 'production';
}
