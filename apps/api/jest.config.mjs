/**
 * Jest for @ffai/api — unit level of the F0.8 harness (no DB, runs anywhere).
 * Integration tests (API ↔ the F0.3 Postgres) live in `*.integration.spec.ts` and run
 * via jest.integration.config.mjs. SWC transforms TS — same decorators + metadata
 * config as the build (.swcrc).
 *
 * @type {import('jest').Config}
 */
export const baseConfig = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // @ffai/types ships as TS source, so let it through the transform; the generated
  // @ffai/db client is already JS and stays ignored.
  transformIgnorePatterns: ['/node_modules/(?!@ffai/types)'],
  setupFiles: ['reflect-metadata'],
};

export default {
  ...baseConfig,
  testRegex: '\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
};
