import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Continuous delivery (F0.5): a self-contained server bundle so the Railway image
  // ships without the full node_modules tree.
  output: 'standalone',
  // Linting has its own `lint` step (eslint flat config); never let a type error slip
  // through the build silently.
  typescript: { ignoreBuildErrors: false },
  // @rondo/ui ships raw TSX source (no build step, F0.6) and @rondo/api-client ships raw TS
  // (generated from the OpenAPI spec, F1.4) — Next must transpile both itself rather than
  // treating them as pre-built node_modules code.
  transpilePackages: ['@rondo/ui', '@rondo/api-client'],
};

export default nextConfig;
