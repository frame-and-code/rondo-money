/**
 * Jest for @rondo/types — the unit level of the F0.8 harness.
 * Pure domain logic, so plain node environment; SWC transforms TS.
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
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: [['lcov', { projectRoot: '../..' }], 'text-summary'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '\\.(spec|test)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  moduleNameMapper: {
    // Jest doesn't implement Node's package self-reference resolution, so tests can
    // import the package by its public name (as consumers do) — map it by hand.
    '^@rondo/types$': '<rootDir>/src/index.ts',
  },
};
