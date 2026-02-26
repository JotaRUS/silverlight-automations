import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: false,
  turbopack: {
    root: __dirname
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.BACKEND_ORIGIN ?? 'http://localhost:3000'}/api/v1/:path*`
      },
      {
        source: '/socket.io/:path*',
        destination: `${process.env.BACKEND_ORIGIN ?? 'http://localhost:3000'}/socket.io/:path*`
      }
    ];
  }
};

export default nextConfig;
