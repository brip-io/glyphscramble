import type { NextConfig } from "next";

// The community documentation build must not phone home from CI or Cloudflare.
process.env.NEXT_TELEMETRY_DISABLED = "1";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
