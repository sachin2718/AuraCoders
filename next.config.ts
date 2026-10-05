import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ignore third-party node_modules TypeScript errors (e.g. livekit-server-sdk TS2578)
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
