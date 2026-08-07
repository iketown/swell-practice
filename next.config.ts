import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.8.182", "*.lhr.life"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
