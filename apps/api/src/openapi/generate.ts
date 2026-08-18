import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { type OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from '@/app.module';
import { buildOpenApiDocument } from '@/openapi/document';

/**
 * Where the generated contract lands: `apps/api/openapi.json`.
 *
 * Two levels up resolves to the same place from `src/openapi` (a spec importing this file)
 * and from `dist/openapi` (the built script), so there is no build-vs-source special case.
 */
export const SPEC_PATH = resolve(__dirname, '../../openapi.json');

/**
 * Build the OpenAPI document without starting anything.
 *
 * `preview: true` is what makes this cheap and dependency-free: Nest wires the module graph
 * and the controller prototypes — all the Swagger scanner ever reads — but instantiates no
 * providers. So `PrismaService` is never constructed, `DATABASE_URL` is never demanded and
 * no connection to Postgres is attempted. Dropping preview mode would reintroduce all three,
 * and the generation step would need a database to describe an API.
 */
export async function generateOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });

  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

/**
 * Two spaces and a trailing newline — `JSON.stringify`'s own shape, deliberately *not* run
 * through Prettier, which would collapse short arrays onto one line. This file is generated
 * output whose only formatter is this function: it is in `.prettierignore`, so the pre-commit
 * hook leaves it alone and the committed file stays byte-identical to what a fresh run
 * produces. A drift check has nothing else to compare.
 */
async function writeSpecFile(): Promise<void> {
  const document = await generateOpenApiDocument();

  await writeFile(SPEC_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

// Only when run as a script (`pnpm --filter @rondo/api openapi`); importing this module from
// a spec must not write files.
if (require.main === module) {
  writeSpecFile().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
