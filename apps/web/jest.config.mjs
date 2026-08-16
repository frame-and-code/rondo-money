/**
 * Jest for @rondo/web (the repo-wide harness is F0.8; this covers F0.5's smoke test).
 * jsdom so React components render; SWC transforms TS/TSX with the automatic JSX runtime,
 * mirroring how Next compiles (no `import React` needed).
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'jsdom',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Coverage is always on: CI (the sonar job, F1.12) reads the lcov, and locally the same
  // command produces the same artefacts. `projectRoot` rewrites lcov paths to be relative
  // to the repo root — the Sonar scanner runs there and cannot resolve `src/…` otherwise.
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
    // Jest doesn't implement Node's package self-reference resolution (a package
    // importing its own name via `exports`), unlike Next's bundler — map it by hand.
    '^@rondo/ui/(.*)$': '<rootDir>/../../packages/ui/src/$1',
  },
  // @testing-library/jest-dom matchers (toBeInTheDocument, …).
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
