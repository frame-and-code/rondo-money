/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageReporters: [['lcov', { projectRoot: '../..' }], 'text-summary'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testRegex: '\\.(spec|test)\\.tsx?$',
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@rondo/ui/(.*)$': '<rootDir>/../../packages/ui/src/$1',
    '^@rondo/api-client$': '<rootDir>/../../packages/api-client/src/index.ts',
    '^@rondo/api-client/react-query$': '<rootDir>/../../packages/api-client/src/react-query.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
