import { type VerifyTokenOptions } from '@clerk/backend';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveWebOrigin } from '@/cors';

const logger = new Logger('ClerkVerification');

/**
 * How `verifyToken()` is told to check a session token's signature. Two supported shapes,
 * in this order:
 *
 * - `CLERK_JWT_KEY` — the instance's PEM public key (Clerk Dashboard → API keys → Show
 *   JWT public key). Verification is then **networkless**: no JWKS round-trip on a cold
 *   start, and nothing to fail when Clerk's API blinks. This is also what the tests use,
 *   with their own key pair, so they exercise the real verification path offline.
 *   **Prefer this anywhere the API is reachable from the internet** — see the warning below.
 * - `CLERK_SECRET_KEY` — the fallback: the JWKS is fetched from Clerk and cached for five
 *   minutes. The cache holds only the key ids Clerk returned, so a token carrying an
 *   unknown `kid` misses it, fetches the JWKS again (with retries) and is never cached as
 *   a miss. A stream of forged tokens with random `kid`s therefore turns into a stream of
 *   outbound requests to Clerk, and the instance's rate limit lands on real users as 401s.
 *   That amplification is the whole reason the PEM key is preferred where it matters.
 *
 * Neither set is a misconfiguration, not a bad request: it throws here instead of letting
 * `verifyToken()` fail and the guard answer 401 to every caller — a login loop nobody can
 * diagnose from the outside.
 *
 * Both shapes also carry `authorizedParties`: the token's `azp` claim names the origin the
 * session token was minted for, and Clerk rejects the token unless it matches ours. That is
 * the standard defence against a token issued to another subdomain being replayed here — and
 * it costs no new configuration, since `WEB_ORIGIN` already names our web client for CORS.
 *
 * The one failure mode to recognise: if a real browser token starts answering 401 once the
 * web app calls the API (F1.6), the cause is this check, and the reason — Clerk naming the
 * `azp` claim and the value it expected — is in the guard's debug log. Fix `WEB_ORIGIN`
 * rather than dropping the check.
 */
export function resolveClerkVerifyOptions(config: ConfigService): VerifyTokenOptions {
  const authorizedParties = [resolveWebOrigin(config)];

  const jwtKey = config.get<string>('CLERK_JWT_KEY');
  if (jwtKey) {
    return { jwtKey, authorizedParties };
  }

  const secretKey = config.get<string>('CLERK_SECRET_KEY');
  if (secretKey) {
    return { secretKey, authorizedParties };
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
  const options = resolveClerkVerifyOptions(app.get(ConfigService));
  if (!options.jwtKey) {
    // Once, at boot, where an operator will see it — not per request, which would be the
    // flood warning about the flood.
    logger.warn(
      'Session tokens are verified against Clerk\'s JWKS endpoint. A token whose "kid" is ' +
        'not already cached costs one outbound request to Clerk, and an unknown "kid" is ' +
        'never cached as a miss — so forged tokens amplify into JWKS traffic. Set ' +
        'CLERK_JWT_KEY (Dashboard → API Keys → JWKS Public Key) to verify without it.',
    );
  }
}
