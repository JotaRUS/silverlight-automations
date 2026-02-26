import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  turbopack: {
    root: __dirname
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3000/api/v1/:path*'
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:3000/socket.io/:path*'
      }
    ];
  }
};

export default nextConfig;
