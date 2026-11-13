import { createPublicKey, type KeyObject } from 'node:crypto';

import { type VerifyTokenOptions } from '@clerk/backend';
import { Logger } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';

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

const CLERK_MODULUS_BITS = 2048;
const CLERK_PUBLIC_EXPONENT = 65537n;

const UNLOADABLE_KEY =
  'CLERK_JWT_KEY is not in the form the api accepts. It takes the 2048-bit RSA public key ' +
  'from the Clerk dashboard exactly as copied, with its line breaks, as docs/deploy-railway.md ' +
  'describes. Fix the variable and start again.';

function parsePublicKey(pem: string): KeyObject | null {
  try {
    return createPublicKey(pem);
  } catch {
    return null;
  }
}

function asCanonicalPem(pem: string): string {
  return `${pem.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
}

export function assertClerkJwtKeyLoadable(pem: string): void {
  const key = parsePublicKey(pem);
  const details = key?.asymmetricKeyDetails;

  const loadable =
    key !== null &&
    key.asymmetricKeyType === 'rsa' &&
    details?.modulusLength === CLERK_MODULUS_BITS &&
    details.publicExponent === CLERK_PUBLIC_EXPONENT &&
    key.export({ type: 'spki', format: 'pem' }).toString() === asCanonicalPem(pem);

  if (!loadable) {
    throw new Error(UNLOADABLE_KEY);
  }
}

export function assertClerkVerificationConfigured(config: ConfigService): void {
  const options = resolveClerkVerifyOptions(config);
  if (options.jwtKey) {
    assertClerkJwtKeyLoadable(options.jwtKey);
  } else {
    logger.warn(
      'Session tokens are verified against Clerk\'s JWKS endpoint. A token whose "kid" is ' +
        'not already cached costs one outbound request to Clerk, and an unknown "kid" is ' +
        'never cached as a miss — so forged tokens amplify into JWKS traffic. Set ' +
        'CLERK_JWT_KEY (Dashboard → API Keys → JWKS Public Key) to verify without it.',
    );
  }
}
