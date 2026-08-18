/**
 * Jest for @rondo/api-client — the unit level of the F0.8 harness.
 * The client is a thin wrapper over `fetch`, so a plain node environment is enough
 * (node 26 ships `fetch`, `Request` and `Response` as globals); SWC transforms TS.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Coverage is always on: CI (the sonar job, F1.12) reads the lcov, and locally the same
  // command produces the same artefacts. `projectRoot` rewrites lcov paths to be relative
  // to the repo root — the Sonar scanner runs there and cannot resolve `src/…` otherwise.
  collectCoverage: true,
  // The generated types carry no runtime code; measuring them would only dilute the number.
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**'],
  coverageReporters: [['lcov', { projectRoot: '../..' }], 'text-summary'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '\\.(spec|test)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  moduleNameMapper: {
    // Jest doesn't implement Node's package self-reference resolution, so tests can
    // import the package by its public name (as consumers do) — map it by hand.
    '^@rondo/api-client$': '<rootDir>/src/index.ts',
  },
};
