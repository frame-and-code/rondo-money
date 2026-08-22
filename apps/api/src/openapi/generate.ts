import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { type OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from '@/app.module';
import { buildOpenApiDocument } from '@/openapi/document';

export const SPEC_PATH = resolve(__dirname, '../../openapi.json');

export async function generateOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });

  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

async function writeSpecFile(): Promise<void> {
  const document = await generateOpenApiDocument();

  await writeFile(SPEC_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

if (require.main === module) {
  writeSpecFile().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
