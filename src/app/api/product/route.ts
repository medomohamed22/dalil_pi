import { geoFromRequest, isCountryCode } from "@/lib/server/geo";
import { rateLimit } from "@/lib/server/ratelimit";
import { productPage } from "@/lib/server/shop";

export const runtime = "nodejs";

/** A product page from Dalil Index (no AI): GET /api/product?id=salla:<uuid>&country=EG. CDN-cached 2 min. */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "product", 120, 60);
  if (limited) return limited;
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  if (!/^(pcm|salla|gtp|pkt):[\w-]{1,64}$/.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const c = u.searchParams.get("country")?.toUpperCase();
  const country = isCountryCode(c) ? c : geoFromRequest(req).country;
  try {
    const page = await productPage(id, country);
    if (!page) return Response.json({ error: "This product isn't available in your country (or is gone).", code: "NOT_FOUND" }, { status: 404 });
    return Response.json({ country, ...page }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
