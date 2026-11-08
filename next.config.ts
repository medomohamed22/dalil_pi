import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Real Chromium for the agent's browser tool: keep it out of the bundle and
  // ship its compressed binary with the chat function only.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No frame-ancestors / X-Frame-Options: the Pi Browser runs apps inside its own frame
          // (its parent origin varies by Pi Browser version and platform), so any framing rule
          // risks a blank white page there.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/cron/catalog": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/local-shops": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/admin/refresh": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
