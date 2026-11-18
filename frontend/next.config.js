/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // used by the multi-stage Dockerfile
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

module.exports = nextConfig;
