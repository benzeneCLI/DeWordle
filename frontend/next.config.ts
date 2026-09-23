import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import withPWAInit from "next-pwa";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

/**
 * PERF-104: Frontend image optimisation with WebP/AVIF and lazy loading.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@dewordle/soroban-sdk"],

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [375, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.dewordle.io",
      },
    ],
  },

  compress: true,
};

export default withPWA(withBundleAnalyzer(nextConfig));