import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: false },
  transpilePackages: ['@rondo/ui', '@rondo/api-client'],
};

export default nextConfig;
