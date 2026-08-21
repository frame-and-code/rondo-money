/**
 * Jest for @rondo/api — unit level of the F0.8 harness (no DB, runs anywhere).
 * Integration tests (API ↔ the F0.3 Postgres) live in `*.integration.spec.ts` and run
 * via jest.integration.config.mjs. SWC transforms TS — same decorators + metadata
 * config as the build (.swcrc).
 *
 * `@rondo/types` resolves to its compiled `dist`, which the package emits, so these tests
 * exercise the same artefact the image runs rather than the TS sources beside it. That is why
 * they need `pnpm --filter @rondo/types build` first — turbo's `^build` already does it.
 *
 * @type {import('jest').Config}
 */
export const baseConfig = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Coverage is always on: CI (the sonar job, F1.12) reads the lcov, and locally the same
  // command produces the same artefacts. `projectRoot` rewrites lcov paths to be relative to
  // the repo root — the Sonar scanner runs there and cannot resolve `src/…` otherwise.
  //
  // Each level writes to its OWN directory (see `coverageDirectory` in the two configs), and
  // `sonar-project.properties` lists both. They cover genuinely different code — the unit run
  // is the only one that reaches `openapi/` and `environment.ts`, while the guard and the
  // scoping extension are covered far more deeply by the integration run — so a shared path
  // meant the second
  // run silently erased the first, and Sonar saw one level's coverage reported as the whole
  // app's.
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
  setupFiles: ['reflect-metadata'],
};

export default {
  ...baseConfig,
  coverageDirectory: '<rootDir>/coverage/unit',
  // Held here rather than in `baseConfig`, because the integration run never touches these
  // files and would fail the threshold at zero. The money boundary is small, pure and entirely
  // reachable from a test — there is no branch in it that needs a database to exercise.
  coverageThreshold: {
    './src/validation/': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
  testRegex: '\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
};
