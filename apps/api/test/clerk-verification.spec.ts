import { generateKeyPairSync } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  assertClerkJwtKeyLoadable,
  assertClerkVerificationConfigured,
  resolveClerkVerifyOptions,
} from '@/auth/clerk-verification';
import { assertWebOriginConfigured, DEFAULT_WEB_ORIGIN } from '@/cors';

import { createTestSigningKey } from './clerk-token';

describe('resolveClerkVerifyOptions', () => {
  const config = new ConfigService();
  const original = {
    jwtKey: process.env.CLERK_JWT_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    webOrigin: process.env.WEB_ORIGIN,
  };

  beforeEach(() => {
    delete process.env.CLERK_JWT_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.WEB_ORIGIN;
  });

  afterAll(() => {
    for (const [name, value] of [
      ['CLERK_JWT_KEY', original.jwtKey],
      ['CLERK_SECRET_KEY', original.secretKey],
      ['WEB_ORIGIN', original.webOrigin],
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('verifies without a network call when the PEM public key is configured', () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';

    expect(resolveClerkVerifyOptions(config)).toEqual({
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: [DEFAULT_WEB_ORIGIN],
    });
  });

  it('falls back to the secret key, which resolves the JWKS from Clerk', () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_not_a_real_key';

    expect(resolveClerkVerifyOptions(config)).toEqual({
      secretKey: 'sk_test_not_a_real_key',
      authorizedParties: [DEFAULT_WEB_ORIGIN],
    });
  });

  it('prefers the PEM public key when both are set, so verification stays offline', () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';
    process.env.CLERK_SECRET_KEY = 'sk_test_not_a_real_key';

    expect(resolveClerkVerifyOptions(config)).toEqual({
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: [DEFAULT_WEB_ORIGIN],
    });
  });

  it("checks the authorized party against the deployment's own web origin", () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';
    process.env.WEB_ORIGIN = 'https://app.rondo.example';

    expect(resolveClerkVerifyOptions(config)).toEqual({
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: ['https://app.rondo.example'],
    });
  });

  it('fails loudly when neither is configured, instead of 401-ing every caller', () => {
    expect(() => resolveClerkVerifyOptions(config)).toThrow(/CLERK_JWT_KEY|CLERK_SECRET_KEY/);
  });
});

describe('the PEM public key checked at start', () => {
  const canonical = createTestSigningKey().publicKeyPem;

  const rsaKey = (modulusLength: number, publicExponent = 65537) =>
    generateKeyPairSync('rsa', { modulusLength, publicExponent }).publicKey;

  it('accepts the key exactly as the Clerk dashboard gives it', () => {
    expect(() => assertClerkJwtKeyLoadable(canonical)).not.toThrow();
  });

  it('accepts the same key with Windows line breaks', () => {
    expect(() => assertClerkJwtKeyLoadable(canonical.replace(/\n/g, '\r\n'))).not.toThrow();
  });

  it.each([
    ['with literal \\n instead of line breaks', canonical.trimEnd().replace(/\n/g, '\\n')],
    ['with a space at the end of a line', canonical.replace('\n', ' \n')],
    ['in the PKCS#1 form', rsaKey(2048).export({ type: 'pkcs1', format: 'pem' }).toString()],
    ['of 4096 bits', rsaKey(4096).export({ type: 'spki', format: 'pem' }).toString()],
    [
      'with an exponent other than 65537',
      rsaKey(2048, 3).export({ type: 'spki', format: 'pem' }).toString(),
    ],
    ['that is not a PEM at all', 'not a key'],
  ])('refuses a key %s, which the Clerk SDK would misread', (_case, pem) => {
    expect(() => assertClerkJwtKeyLoadable(pem)).toThrow(/CLERK_JWT_KEY/);
  });

  it('refuses a key on a single line too, though the Clerk SDK would load it', () => {
    expect(() => assertClerkJwtKeyLoadable(canonical.replace(/\n/g, ''))).toThrow(/CLERK_JWT_KEY/);
  });

  it('never repeats the key in the message', () => {
    const broken = canonical.replace(/\n/g, '');
    const body = canonical.split('\n')[1] ?? '';

    expect(() => assertClerkJwtKeyLoadable(broken)).toThrow(/CLERK_JWT_KEY/);
    try {
      assertClerkJwtKeyLoadable(broken);
    } catch (error) {
      expect(String(error)).not.toContain(body.slice(10, 40));
    }
  });
});

describe('assertClerkVerificationConfigured', () => {
  const config = new ConfigService();
  const original = {
    jwtKey: process.env.CLERK_JWT_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  };

  beforeEach(() => {
    delete process.env.CLERK_JWT_KEY;
    delete process.env.CLERK_SECRET_KEY;
  });

  afterAll(() => {
    for (const [name, value] of [
      ['CLERK_JWT_KEY', original.jwtKey],
      ['CLERK_SECRET_KEY', original.secretKey],
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('stops the start on a PEM key that is not in the form Clerk prints', () => {
    process.env.CLERK_JWT_KEY = createTestSigningKey().publicKeyPem.replace(/\n/g, '');

    expect(() => assertClerkVerificationConfigured(config)).toThrow(/CLERK_JWT_KEY/);
  });

  it('starts on a well-formed PEM key', () => {
    process.env.CLERK_JWT_KEY = createTestSigningKey().publicKeyPem;

    expect(() => assertClerkVerificationConfigured(config)).not.toThrow();
  });

  it('starts on the secret key alone, as before', () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_not_a_real_key';

    expect(() => assertClerkVerificationConfigured(config)).not.toThrow();
  });
});

describe('assertWebOriginConfigured', () => {
  const config = new ConfigService();
  const original = process.env.WEB_ORIGIN;

  afterAll(() => {
    if (original === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = original;
    }
  });

  it('throws when WEB_ORIGIN is unset, naming the consequence', () => {
    delete process.env.WEB_ORIGIN;

    expect(() => assertWebOriginConfigured(config)).toThrow(/WEB_ORIGIN is not set/);
    expect(() => assertWebOriginConfigured(config)).toThrow(/401/);
  });

  it('passes once it is set', () => {
    process.env.WEB_ORIGIN = 'https://app.rondo.example';

    expect(() => assertWebOriginConfigured(config)).not.toThrow();
  });

  it.each([
    ['a trailing slash', 'https://app.rondo.example/'],
    ['a path', 'https://app.rondo.example/app'],
    ['not a URL at all', 'app.rondo.example'],
  ])('rejects %s', (_case, value) => {
    process.env.WEB_ORIGIN = value;

    expect(() => assertWebOriginConfigured(config)).toThrow(/WEB_ORIGIN/);
  });
});
