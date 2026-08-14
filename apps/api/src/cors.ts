import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Fallback web origin for local dev, where `@rondo/web` runs on :3001 (the API is on :3000).
 * On Railway/prod `WEB_ORIGIN` must be set to the deployed web URL — never hardcode it here.
 */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3001';

/**
 * The web origin CORS is scoped to: `WEB_ORIGIN` via `ConfigService` (same source as
 * `DATABASE_URL`), falling back to local dev. Exposed so the e2e test can assert against
 * the exact value the app allows instead of re-deriving (and drifting from) it.
 */
export function resolveWebOrigin(app: INestApplication): string {
  return app.get(ConfigService).get<string>('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN;
}

/**
 * Scope CORS to the web origin so the browser client (`apps/web`, `apiFetch`) can call the
 * API cross-origin without failing the preflight.
 *
 * Shared by `main.ts` and the e2e test so both exercise the exact same configuration.
 */
export function enableWebCors(app: INestApplication): void {
  app.enableCors({ origin: resolveWebOrigin(app) });
}
