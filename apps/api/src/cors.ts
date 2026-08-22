import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DEFAULT_WEB_ORIGIN = 'http://localhost:3001';

export function resolveWebOrigin(config: ConfigService): string {
  return config.get<string>('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN;
}

export function assertWebOriginConfigured(config: ConfigService): void {
  const configured = config.get<string>('WEB_ORIGIN');

  if (!configured) {
    throw new Error(
      'WEB_ORIGIN is not set. It is both the CORS allowance and the "azp" claim every ' +
        'session token must carry, so starting without it would answer 401 to every ' +
        `authenticated request. Set it to the web app's origin (locally ${DEFAULT_WEB_ORIGIN}, ` +
        'see .env.example; on Railway the deployed web URL).',
    );
  }

  let origin: string;
  try {
    origin = new URL(configured).origin;
  } catch {
    throw new Error(
      `WEB_ORIGIN is not a URL: ${configured}. Expected an origin like ${DEFAULT_WEB_ORIGIN}.`,
    );
  }

  if (origin !== configured || !/^https?:$/.test(new URL(configured).protocol)) {
    throw new Error(
      `WEB_ORIGIN must be an exact http(s) origin, with no trailing slash and no path: ` +
        `got ${configured}, expected ${origin}. It is compared verbatim by CORS and by the ` +
        'token\'s "azp" claim, so anything else rejects every authenticated request.',
    );
  }
}

export function enableWebCors(app: INestApplication): void {
  app.enableCors({ origin: resolveWebOrigin(app.get(ConfigService)) });
}
