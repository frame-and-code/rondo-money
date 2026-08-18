import { ConfigService } from '@nestjs/config';

import {
  APP_ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
  resolveEnvironment,
  type AppEnvironment,
} from '@/environment';
import { areApiDocsEnabled } from '@/openapi/document';

/**
 * `NODE_ENV` is the only thing standing between production and an anonymous "Try it out"
 * console pointed at real data: the Swagger UI is mounted by the HTTP adapter, so the global
 * guard never sees those routes. That makes a one-line comparison load-bearing — invert it,
 * drop `'production'` from the list, or mistype a value, and every check in this repository
 * still passes while the deployment quietly opens up.
 */
const configWith = (nodeEnv: string): ConfigService => new ConfigService({ NODE_ENV: nodeEnv });

/**
 * Genuinely unset, which an empty internal config does **not** produce: `ConfigService` falls
 * back to `process.env`, and Jest puts `NODE_ENV=test` there. Removing the variable for the
 * duration is the only way to exercise the default a developer's shell actually hits.
 */
function withoutNodeEnv<T>(run: (config: ConfigService) => T): T {
  const original = process.env.NODE_ENV;
  delete process.env.NODE_ENV;

  try {
    return run(new ConfigService({}));
  } finally {
    if (original === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = original;
    }
  }
}

describe('resolveEnvironment', () => {
  it('defaults to development when NODE_ENV is not set', () => {
    expect(withoutNodeEnv(resolveEnvironment)).toBe(DEFAULT_ENVIRONMENT);
    expect(DEFAULT_ENVIRONMENT).toBe('development');
  });

  it('defaults to development when NODE_ENV is empty or blank', () => {
    expect(resolveEnvironment(configWith(''))).toBe('development');
    expect(resolveEnvironment(configWith('   '))).toBe('development');
  });

  it.each(APP_ENVIRONMENTS)('accepts %s', (environment: AppEnvironment) => {
    expect(resolveEnvironment(configWith(environment))).toBe(environment);
  });

  it('ignores surrounding whitespace, which a dashboard field collects easily', () => {
    expect(resolveEnvironment(configWith(' production '))).toBe('production');
  });

  it('refuses an unrecognised value instead of guessing, and names it', () => {
    // The failure mode this prevents: `prodction` read as "not production" would serve the
    // documentation on the one deployment meant to hide it.
    expect(() => resolveEnvironment(configWith('prodction'))).toThrow(/prodction/);
    expect(() => resolveEnvironment(configWith('prod'))).toThrow(/development, test, production/);
  });

  it('recognises exactly three environments, so adding one is a deliberate edit', () => {
    expect([...APP_ENVIRONMENTS]).toEqual(['development', 'test', 'production']);
  });
});

describe('areApiDocsEnabled', () => {
  it('serves the documentation everywhere except production', () => {
    expect(withoutNodeEnv(areApiDocsEnabled)).toBe(true);
    expect(areApiDocsEnabled(configWith('development'))).toBe(true);
    expect(areApiDocsEnabled(configWith('test'))).toBe(true);
  });

  it('withholds it in production', () => {
    expect(areApiDocsEnabled(configWith('production'))).toBe(false);
  });
});
