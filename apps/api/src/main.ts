import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '@/app.module';
import { assertClerkVerificationConfigured } from '@/auth/clerk-verification';
import { assertWebOriginConfigured } from '@/cors';
import { createHttpApp } from '@/http-app';
import { API_DOCS_PATH, areApiDocsEnabled, buildOpenApiDocument } from '@/openapi/document';

async function bootstrap(): Promise<void> {
  const app = await createHttpApp(AppModule);
  const config = app.get(ConfigService);
  app.enableShutdownHooks();
  assertClerkVerificationConfigured(app);
  assertWebOriginConfigured(config);
  if (areApiDocsEnabled(config)) {
    SwaggerModule.setup(API_DOCS_PATH, app, buildOpenApiDocument(app));
  }
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
