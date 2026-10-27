import { type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';

import { enableWebCors } from '@/cors';
import { ROUTING_OPTIONS } from '@/routing';

export const DEFAULT_BODY_LIMIT = '100kb';

export interface HttpAppOptions {
  bodyLimit?: string;
}

export async function createHttpApp(
  module: Type<unknown>,
  { bodyLimit = DEFAULT_BODY_LIMIT }: HttpAppOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(module, { ...ROUTING_OPTIONS });

  app.useSecurityHeaders();
  enableWebCors(app);
  app.useBodyParser('json', { limit: bodyLimit });

  return app;
}
