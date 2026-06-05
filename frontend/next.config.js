/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',     // nécessaire pour le Dockerfile multi-stage
  compress: true,           // gzip pour faible connexion
  images: {
    remotePatterns: [
      { protocol: 'http',  hostname: 'localhost' },
      { protocol: 'https', hostname: '*.transur.cd' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL:    process.env.NEXT_PUBLIC_API_URL    || 'http://localhost:5000/api',
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000',
  },
};

module.exports = nextConfig;
