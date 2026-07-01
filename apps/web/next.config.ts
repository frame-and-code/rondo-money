import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Continuous delivery (F0.5): a self-contained server bundle so the Railway image
  // ships without the full node_modules tree.
  output: 'standalone',
  // Linting has its own `lint` step (eslint flat config); never let a type error slip
  // through the build silently.
  typescript: { ignoreBuildErrors: false },
  // @ffai/ui ships raw TSX source (no build step, F0.6) — Next must transpile it
  // itself rather than treating it as pre-built node_modules code.
  transpilePackages: ['@ffai/ui'],
};

export default nextConfig;
