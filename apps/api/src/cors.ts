import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Fallback web origin for local dev, where `@rondo/web` runs on :3001 (the API is on :3000).
 * On Railway/prod `WEB_ORIGIN` must be set to the deployed web URL — never hardcode it here,
 * and see `assertWebOriginConfigured` for why the fallback is not allowed to reach a deploy.
 */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3001';

/**
 * The web origin the API trusts: `WEB_ORIGIN` via `ConfigService` (same source as
 * `DATABASE_URL`), falling back to local dev. Exposed so tests can assert against the exact
 * value the app allows instead of re-deriving (and drifting from) it.
 *
 * Takes the `ConfigService` rather than the application, because it now has a second caller
 * that has no application object to hand: `resolveClerkVerifyOptions`, which checks the same
 * origin against the token's `azp` claim on every request. One source keeps the CORS
 * allowance and the token check from drifting apart.
 */
export function resolveWebOrigin(config: ConfigService): string {
  return config.get<string>('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN;
}

/**
 * Refuse to boot without `WEB_ORIGIN`, instead of serving a deployment where every
 * authenticated request is a 401.
 *
 * Since F1.3 this variable does more than scope CORS: it is the `azp` value a session token
 * must carry (`resolveClerkVerifyOptions`). Unset, the API silently trusts only tokens minted
 * for `http://localhost:3001` — so a Railway service missing the variable starts fine, keeps
 * answering the anonymous healthcheck with 200, passes its deploy, and rejects every real
 * caller with no CORS error anywhere to hint at why.
 *
 * Called from `main.ts` only, which is what keeps the fallback usable where it is harmless:
 * specs build the app through `Test.createTestingModule` and never come through here.
 */
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

  // Both consumers compare the value verbatim: the browser sends `https://app.example` as its
  // Origin, and Clerk matches `azp` by equality. So a trailing slash or a path — the shapes
  // someone naturally pastes from a browser's address bar — do not "mostly work": they fail
  // every request, in a way no error message points at. Cheap to reject here, expensive to
  // diagnose on a deployment.
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

/**
 * Scope CORS to the web origin so the browser client (`apps/web`, `apiFetch`) can call the
 * API cross-origin without failing the preflight.
 *
 * Shared by `main.ts` and the e2e test so both exercise the exact same configuration.
 */
export function enableWebCors(app: INestApplication): void {
  app.enableCors({ origin: resolveWebOrigin(app.get(ConfigService)) });
}
