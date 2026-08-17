import { ConfigService } from '@nestjs/config';

import { resolveClerkVerifyOptions } from '@/auth/clerk-verification';

// Unit level (F0.8): no DB, no network. The environment is manipulated directly because
// that is where ConfigService looks first, and it is the path the deployed api takes —
// Railway passes real environment variables, not .env files.
describe('resolveClerkVerifyOptions', () => {
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
    // Unit specs share a process too — restore instead of leaving the suite's own values.
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

  it('verifies without a network call when the PEM public key is configured', () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';

    expect(resolveClerkVerifyOptions(config)).toEqual({ jwtKey: process.env.CLERK_JWT_KEY });
  });

  it('falls back to the secret key, which resolves the JWKS from Clerk', () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_not_a_real_key';

    expect(resolveClerkVerifyOptions(config)).toEqual({ secretKey: 'sk_test_not_a_real_key' });
  });

  it('prefers the PEM public key when both are set, so verification stays offline', () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';
    process.env.CLERK_SECRET_KEY = 'sk_test_not_a_real_key';

    expect(resolveClerkVerifyOptions(config)).toEqual({ jwtKey: process.env.CLERK_JWT_KEY });
  });

  it('fails loudly when neither is configured, instead of 401-ing every caller', () => {
    expect(() => resolveClerkVerifyOptions(config)).toThrow(/CLERK_JWT_KEY|CLERK_SECRET_KEY/);
  });
});
