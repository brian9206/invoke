/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    REPOSITORY_URL: process.env.REPOSITORY_URL || 'http://localhost:3002',
    EXECUTION_URL: process.env.EXECUTION_URL || 'http://localhost:3001',
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || String(100 * 1024 * 1024),
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
}

module.exports = nextConfig;