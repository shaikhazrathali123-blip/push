const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/storage\.googleapis\.com\/tfjs-models\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "tfjs-model-cache",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /^https:\/\/lh3\.googleusercontent\.com\/.*/i,
      handler: "CacheFirst",
      options: { cacheName: "avatar-cache", expiration: { maxEntries: 60 } },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

module.exports = withPWA(nextConfig);
