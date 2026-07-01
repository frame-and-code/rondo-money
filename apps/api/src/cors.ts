import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Fallback web origin for local dev, where `@ffai/web` runs on :3001 (the API is on :3000).
 * On Railway/prod `WEB_ORIGIN` must be set to the deployed web URL — never hardcode it here.
 */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3001';

/**
 * Scope CORS to the web origin so the browser client (`apps/web`, `apiFetch`) can call the
 * API cross-origin without failing the preflight. Origin comes from `WEB_ORIGIN` via
 * `ConfigService` (same source as `DATABASE_URL`), falling back to local dev.
 *
 * Shared by `main.ts` and the e2e test so both exercise the exact same configuration.
 */
export function enableWebCors(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origin = config.get<string>('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN;
  app.enableCors({ origin });
}
