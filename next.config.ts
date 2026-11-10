import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Real Chromium for the agent's browser tool: kept out of the bundle; the binary is downloaded
  // at run time (browser.ts), so no function carries 67 MB per deployment.
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
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
      {
        // The owner panel is not indexed. It may be framed (the Pi Browser shows sites in a frame);
        // inside a frame it never reuses a saved session (admin/page.tsx).
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default nextConfig;
