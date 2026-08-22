/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**'],
  coverageReporters: [['lcov', { projectRoot: '../..' }], 'text-summary'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '\\.(spec|test)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['@swc/jest'],
  },
  moduleNameMapper: {
    '^@rondo/api-client$': '<rootDir>/src/index.ts',
  },
};
