import { ConfigService } from '@nestjs/config';

import { resolveClerkVerifyOptions } from '@/auth/clerk-verification';
import { assertWebOriginConfigured, DEFAULT_WEB_ORIGIN } from '@/cors';

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
