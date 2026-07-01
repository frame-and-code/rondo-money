import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { enableWebCors } from '@/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Let Nest tear down providers (Prisma $disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  // Scope CORS to the web origin so the browser client can reach the API cross-origin.
  enableWebCors(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
