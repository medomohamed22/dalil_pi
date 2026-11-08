import { siteSettings } from "@/lib/server/settings";

export const runtime = "nodejs";

/** Public site settings (home row, announcement). Cached 60 s at the CDN. */
export async function GET() {
  const s = await siteSettings();
  return Response.json({ featured: s.featured, announcement: s.announcement, hidden_stores: s.hidden_stores }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
