import path from 'node:path';
import { config as loadEnvironmentFile } from 'dotenv';
import type { NextConfig } from 'next';
import { resolveApiOrigin } from './src/api/server/environment';

loadEnvironmentFile({ path: path.resolve(process.cwd(), '../../.env') });

const apiOrigin = resolveApiOrigin();
const demoOnly = process.env.ACADEMYOPS_DEMO_ONLY === 'true';
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  distDir: process.env.PLG_OWNER_QA === 'true' ? '.next-owner-qa' : '.next',
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  devIndicators: false,
  experimental: {
    optimizePackageImports: [
      'iconsax-react',
      'lucide-react',
      '@remixicon/react',
      '@nivo/bar',
      '@nivo/line',
      '@nivo/pie',
      'react-aria-components',
    ],
  },
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@academyops/api-client', '@academyops/ui'],
  turbopack: { root: path.resolve(process.cwd(), '../..') },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: '/', destination: demoOnly ? '/en/login' : '/ar/login', permanent: false }];
  },
  async rewrites() {
    if (demoOnly) return [];
    return {
      beforeFiles: [
        { source: '/socket.io', destination: `${apiOrigin}/socket.io` },
        { source: '/socket.io/:path*', destination: `${apiOrigin}/socket.io/:path*` },
        { source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` },
      ],
    };
  },
};

export default nextConfig;
