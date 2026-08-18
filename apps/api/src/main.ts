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
  // Let Nest tear down providers (Prisma $disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  // Refuse to start without a Clerk key rather than 401 every authenticated request.
  assertClerkVerificationConfigured(app);
  // Same reasoning for WEB_ORIGIN: since F1.3 it is also the accepted `azp`, so the wrong
  // value (or none) 401s every caller while the anonymous healthcheck still reports 200.
  assertWebOriginConfigured(config);
  // Scope CORS to the web origin so the browser client can reach the API cross-origin.
  enableWebCors(app);
  // The browsable contract, everywhere but production (F1.4). Swagger mounts it through the
  // HTTP adapter rather than as a controller, so the global guard never sees these routes —
  // wherever the UI is served it is served to everyone, which is the whole reason production
  // does without it.
  if (areApiDocsEnabled(config)) {
    SwaggerModule.setup(API_DOCS_PATH, app, buildOpenApiDocument(app));
  }
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
