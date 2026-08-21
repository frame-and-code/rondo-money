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
  // The package is pure functions over strings and bigints — there is no environment to make
  // a branch unreachable, so anything short of 100% here is a case nobody thought about
  // rather than a case nobody could reach.
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
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
    // The sources write relative imports with a `.js` extension while the files on disk are
    // `.ts` — jest resolves against disk, so strip it back off. (The extension is a convention
    // here, not a requirement: this package is CommonJS, so extensionless would resolve too.)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
