/** @type {import('jest').Config} */
export const baseConfig = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
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
  coverageThreshold: {
    './src/validation/': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
  testRegex: '\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
};
