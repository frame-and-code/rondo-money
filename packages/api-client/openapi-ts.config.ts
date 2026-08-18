import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Codegen for @rondo/api-client (F1.4).
 *
 * The input is the contract `apps/api` writes from its own code — see that workspace's
 * README. Everything below lands in `src/generated`, which is committed: a contract change
 * has to show up as a diff in review.
 *
 * The fetch client is **bundled** into the output rather than installed. That is not a
 * preference: the standalone `@hey-api/client-fetch` package is deprecated ("bundled directly
 * inside @hey-api/openapi-ts" since v0.73.0), so bundling is the supported path. The cost is
 * real and worth stating — the HTTP runtime lives in this repository as generated code, so a
 * fix in it arrives only when the generator is bumped *and* the output regenerated. The CI
 * drift check (F1.5) is what turns that into a failing build rather than a silent staleness.
 */
export default defineConfig({
  input: '../../apps/api/openapi.json',
  output: 'src/generated',
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    '@hey-api/sdk',
    // Response schemas straight from the spec. Nothing parses with them yet; the first
    // consumer is Phase 3, where a money amount arrives as a string and has to be validated
    // before it is parsed into a bigint.
    'zod',
    // Query options rather than hooks: `useQuery(meControllerIdentifyOptions())`. They
    // compose, and the query-key design stays ours — which matters here, because no derived
    // value is stored, so a single mutation invalidates RTA and every month's Available.
    '@tanstack/react-query',
  ],
});
