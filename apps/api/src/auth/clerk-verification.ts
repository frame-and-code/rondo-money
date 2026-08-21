import { type VerifyTokenOptions } from '@clerk/backend';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveWebOrigin } from '@/cors';

const logger = new Logger('ClerkVerification');

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

export function assertClerkVerificationConfigured(app: INestApplication): void {
  const options = resolveClerkVerifyOptions(app.get(ConfigService));
  if (!options.jwtKey) {
    logger.warn(
      'Session tokens are verified against Clerk\'s JWKS endpoint. A token whose "kid" is ' +
        'not already cached costs one outbound request to Clerk, and an unknown "kid" is ' +
        'never cached as a miss — so forged tokens amplify into JWKS traffic. Set ' +
        'CLERK_JWT_KEY (Dashboard → API Keys → JWKS Public Key) to verify without it.',
    );
  }
}
