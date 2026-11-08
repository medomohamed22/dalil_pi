import { rateLimit } from "@/lib/server/ratelimit";
import { todaysDeals } from "@/lib/server/community";
import { geoFromRequest, isCountryCode } from "@/lib/server/geo";

export const runtime = "nodejs";

/** Biggest recent price drops Dalil Pi has seen in a country. Cached 30 min at the CDN. */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "deals", 60, 60);
  if (limited) return limited;
  const c = new URL(req.url).searchParams.get("country")?.toUpperCase();
  const country = isCountryCode(c) ? c : geoFromRequest(req).country;
  return Response.json({ country, deals: await todaysDeals(country) }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
