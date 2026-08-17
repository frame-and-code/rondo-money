import { createSign, generateKeyPairSync } from 'node:crypto';

/**
 * Clerk-shaped session tokens signed by a key pair generated in the test process.
 *
 * The point is that the auth tests never reach the network: the guard is pointed at
 * `publicKeyPem` through `CLERK_JWT_KEY`, so the real `verifyToken()` runs — real
 * signature check, real expiry check — against a key we own. Mocking `verifyToken()`
 * instead would leave the one thing worth proving untested.
 */

/** The claims of a Clerk session token, trimmed to what the guard reads. */
export interface SessionTokenClaims {
  /** The Clerk user id. */
  sub: string;
  iat: number;
  exp: number;
}

export interface TestSigningKey {
  /** The PEM public key to hand the guard as `CLERK_JWT_KEY`. */
  publicKeyPem: string;
  /** Signs `claims` into an RS256 JWT. */
  signToken(claims: SessionTokenClaims): string;
}

const base64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

export function createTestSigningKey(): TestSigningKey {
  // 2048 bits is not a taste: @clerk/backend turns the PEM into a JWK by string surgery on
  // the standard 2048-bit RSA SPKI prefix (`loadClerkJwkFromPem`), and a key of any other
  // size produces a modulus it cannot read.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),

    signToken(claims: SessionTokenClaims): string {
      const signingInput = `${base64url(
        JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'rondo-test-key' }),
      )}.${base64url(JSON.stringify(claims))}`;
      const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);

      return `${signingInput}.${base64url(signature)}`;
    },
  };
}
