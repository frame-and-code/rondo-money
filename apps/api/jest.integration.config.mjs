import { baseConfig } from './jest.config.mjs';

/** @type {import('jest').Config} */
export default {
  ...baseConfig,
  coverageDirectory: '<rootDir>/coverage/integration',
  testRegex: '\\.integration\\.spec\\.ts$',
};
