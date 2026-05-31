import type { NextConfig } from "next";

const offlineCacheVersion =
  process.env.NEXT_PUBLIC_OFFLINE_CACHE_VERSION ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_OFFLINE_CACHE_VERSION: offlineCacheVersion,
  },
  turbopack: {
    resolveAlias: {
      fs: "./src/lib/empty-node-module.ts",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
