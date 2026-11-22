import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.8.182", "*.lhr.life"],
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "docs\\.theswell\\.live" }],
        destination: "https://www.theswell.live/sp",
        permanent: false,
      },
      {
        source: "/production-documents/11.20.26/:file",
        destination: "/sp?ver=11.20.26",
        permanent: false,
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
