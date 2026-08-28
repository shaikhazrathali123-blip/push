const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "mediapipe-model-cache",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "mediapipe-wasm-cache",
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
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

module.exports = withPWA(nextConfig);
