import { createSign, generateKeyPairSync } from 'node:crypto';

export interface SessionTokenClaims {
  sub: string;
  iat: number;
  exp: number;
  azp?: string;
}

export interface TestSigningKey {
  publicKeyPem: string;
  signToken(claims: SessionTokenClaims): string;
}

const base64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

export function createTestSigningKey(): TestSigningKey {
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
