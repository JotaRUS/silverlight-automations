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
  // Proxies browser calls from the Next origin (e.g. :3001) to Express (:3000). Requires API running locally.
  // Dev uses `next dev --webpack` so rewrites apply reliably; see README quick start.
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
