import { baseConfig } from './jest.config.mjs';

/**
 * Integration level of the F0.8 harness: only `*.integration.spec.ts`, which boot the
 * real Nest app against the F0.3 Postgres (`docker compose up -d` first). Run serially
 * (--runInBand in the script) so tests never race each other on shared DB state.
 *
 * @type {import('jest').Config}
 */
export default {
  ...baseConfig,
  coverageDirectory: '<rootDir>/coverage/integration',
  testRegex: '\\.integration\\.spec\\.ts$',
};
