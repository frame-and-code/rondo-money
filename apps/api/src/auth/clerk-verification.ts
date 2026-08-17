import { type VerifyTokenOptions } from '@clerk/backend';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * How `verifyToken()` is told to check a session token's signature. Two supported shapes,
 * in this order:
 *
 * - `CLERK_JWT_KEY` — the instance's PEM public key (Clerk Dashboard → API keys → Show
 *   JWT public key). Verification is then **networkless**: no JWKS round-trip on a cold
 *   start, and nothing to fail when Clerk's API blinks. This is also what the tests use,
 *   with their own key pair, so they exercise the real verification path offline.
 * - `CLERK_SECRET_KEY` — the fallback: the JWKS is fetched from Clerk and cached.
 *
 * Neither set is a misconfiguration, not a bad request: it throws here instead of letting
 * `verifyToken()` fail and the guard answer 401 to every caller — a login loop nobody can
 * diagnose from the outside.
 *
 * `authorizedParties` (the `azp` check against the frontend origin) is deliberately not
 * configured yet: nothing sends the API a token before F1.3, so there is no way to prove
 * the claim's value here — see the ticket note in the PR.
 */
export function resolveClerkVerifyOptions(config: ConfigService): VerifyTokenOptions {
  const jwtKey = config.get<string>('CLERK_JWT_KEY');
  if (jwtKey) {
    return { jwtKey };
  }

  const secretKey = config.get<string>('CLERK_SECRET_KEY');
  if (secretKey) {
    return { secretKey };
  }

  throw new Error(
    'Clerk token verification is not configured: set CLERK_JWT_KEY (PEM public key, ' +
      'verified without a network call) or CLERK_SECRET_KEY (JWKS fetched from Clerk).',
  );
}

/**
 * Fail at boot instead of at the first protected request. A deploy without a Clerk key
 * can serve `/health` perfectly well and 401 every real call — this turns that into a
 * crash the platform's healthcheck reports (mirrors how `cors.ts` is wired from `main.ts`).
 */
export function assertClerkVerificationConfigured(app: INestApplication): void {
  resolveClerkVerifyOptions(app.get(ConfigService));
}
