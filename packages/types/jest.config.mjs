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
