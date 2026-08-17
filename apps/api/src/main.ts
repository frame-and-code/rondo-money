import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { assertClerkVerificationConfigured } from '@/auth/clerk-verification';
import { enableWebCors } from '@/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Let Nest tear down providers (Prisma $disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  // Refuse to start without a Clerk key rather than 401 every authenticated request.
  assertClerkVerificationConfigured(app);
  // Scope CORS to the web origin so the browser client can reach the API cross-origin.
  enableWebCors(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
