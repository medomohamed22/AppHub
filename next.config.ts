import type { NextConfig } from "next";

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isDemoMode ? ["'unsafe-eval'"] : []),
  "https://sdk.minepi.com",
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources}`,
  "connect-src 'self' https://api.minepi.com https://*.supabase.co wss://*.supabase.co",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.minepi.com https://sdk.minepi.com",
  "frame-ancestors 'self' https://*.minepi.com",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["@babylonjs/core"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
