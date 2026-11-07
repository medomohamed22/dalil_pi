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
          // No framing (clickjacking on the approve-and-pay buttons).
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // The guided demo shows the approver's page inside Dalil itself ("Mom's phone").
        // Same-origin framing only — other sites still can't frame it.
        source: "/f/:id",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
