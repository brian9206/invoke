/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    REPOSITORY_URL: process.env.REPOSITORY_URL || 'http://localhost:3002',
    EXECUTION_URL: process.env.EXECUTION_URL || 'http://localhost:3001',
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/admin',
        permanent: false,
      },
    ];
  },
  // Configure file upload limits
  serverRuntimeConfig: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
  publicRuntimeConfig: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
}

module.exports = nextConfig;