import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Continuous delivery (F0.5): a self-contained server bundle so the Railway image
  // ships without the full node_modules tree.
  output: 'standalone',
  // Linting has its own `lint` step (eslint flat config); never let a type error slip
  // through the build silently.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
