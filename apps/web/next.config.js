/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Mark Node.js-only modules as external for client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    // Ensure server-side packages are not bundled for client
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('pg', 'drizzle-orm');
    }
    return config;
  },
  // Note: pdf-parse is handled by API server, not needed in web app
  // Server-side packages (pg, drizzle-orm) are handled via webpack externals above
};
export default nextConfig;
