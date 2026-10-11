import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The SDK keeps global state. Loading it natively gives instrumentation.ts and the route handlers
  // one shared copy, instead of a bundled copy per entry point.
  serverExternalPackages: ["neatlogs"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
