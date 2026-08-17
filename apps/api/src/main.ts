import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { assertClerkVerificationConfigured } from '@/auth/clerk-verification';
import { assertWebOriginConfigured, enableWebCors } from '@/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Let Nest tear down providers (Prisma $disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  // Refuse to start without a Clerk key rather than 401 every authenticated request.
  assertClerkVerificationConfigured(app);
  // Same reasoning for WEB_ORIGIN: since F1.3 it is also the accepted `azp`, so the wrong
  // value (or none) 401s every caller while the anonymous healthcheck still reports 200.
  assertWebOriginConfigured(app.get(ConfigService));
  // Scope CORS to the web origin so the browser client can reach the API cross-origin.
  enableWebCors(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
