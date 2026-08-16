/**
 * Jest for @rondo/api — unit level of the F0.8 harness (no DB, runs anywhere).
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
  // Coverage is always on: CI (the sonar job, F1.12) reads the lcov, and locally the same
  // command produces the same artefacts. Shared by both configs — in the sonar job the
  // integration run overwrites the (empty) unit lcov, so api coverage comes from the level
  // that actually exercises it. `projectRoot` rewrites lcov paths to be relative to the
  // repo root — the Sonar scanner runs there and cannot resolve `src/…` otherwise.
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: [['lcov', { projectRoot: '../..' }], 'text-summary'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // @rondo/types ships as TS source, so let it through the transform; the generated
  // @rondo/db client is already JS and stays ignored.
  transformIgnorePatterns: ['/node_modules/(?!@rondo/types)'],
  setupFiles: ['reflect-metadata'],
};

export default {
  ...baseConfig,
  testRegex: '\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
};
