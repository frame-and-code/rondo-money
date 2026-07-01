/**
 * Jest for @ffai/web (the repo-wide harness is F0.8; this covers F0.5's smoke test).
 * jsdom so React components render; SWC transforms TS/TSX with the automatic JSX runtime,
 * mirroring how Next compiles (no `import React` needed).
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'jsdom',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
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
  },
  // @testing-library/jest-dom matchers (toBeInTheDocument, …).
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
