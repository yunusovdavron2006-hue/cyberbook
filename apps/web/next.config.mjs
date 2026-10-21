/** @type {import('next').NextConfig} */
const API_ORIGIN = (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cyberbook/api-client'],
  output: 'standalone',
  // Proxy API calls through the same origin as the web app. This keeps browser
  // requests same-origin (no CORS, no mixed-content blocks when the site is
  // served over HTTPS via a tunnel such as ngrok) while the Next server forwards
  // them to the internal API origin.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
