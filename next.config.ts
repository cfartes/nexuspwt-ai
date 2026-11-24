import type { NextConfig } from 'next';
const config: NextConfig = {
  env: { NEXT_PUBLIC_APP_RELEASE: process.env.APP_RELEASE || 'development' },
  generateBuildId: process.env.APP_RELEASE ? async () => process.env.APP_RELEASE! : undefined,
  output: 'standalone',
  serverExternalPackages: ['exceljs', 'pdfkit'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ];
  },
};
export default config;
