import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: ({ url }: { url: URL }) => /^\/(api|account|admin|login|reset-password)(\/|$)/.test(url.pathname),
      handler: "NetworkOnly",
    },
    {
      urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => sameOrigin && (
        url.pathname === '/' || /^\/focus(\/|$)/.test(url.pathname) ||
        /^\/(_next\/static\/|icon-|favicon|manifest\.json|website_qrcode\.png)/.test(url.pathname)
      ),
      handler: "NetworkFirst",
      options: {
        cacheName: "offlineCache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas', '@prisma/client'],
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }];
  },
};

export default withPWA(nextConfig);
