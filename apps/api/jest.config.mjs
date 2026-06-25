/**
 * Jest for @ffai/api (the repo-wide harness is F0.8; this covers F0.4's own tests).
 * SWC transforms TS — same decorators + metadata config as the build (.swcrc).
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '\\.(spec|e2e-spec)\\.ts$',
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
