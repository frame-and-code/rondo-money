import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '@/app.module';
import { assertClerkVerificationConfigured } from '@/auth/clerk-verification';
import { assertWebOriginConfigured, enableWebCors } from '@/cors';
import { API_DOCS_PATH, areApiDocsEnabled, buildOpenApiDocument } from '@/openapi/document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.enableShutdownHooks();
  assertClerkVerificationConfigured(app);
  assertWebOriginConfigured(config);
  enableWebCors(app);
  if (areApiDocsEnabled(config)) {
    SwaggerModule.setup(API_DOCS_PATH, app, buildOpenApiDocument(app));
  }
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
