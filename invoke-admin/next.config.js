/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg-listen', 'pg-format', 'sequelize', 'pg', 'pg-hstore'],
  poweredByHeader: false,
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