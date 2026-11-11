import { geoFromRequest, isCountryCode } from "@/lib/server/geo";
import { rateLimit } from "@/lib/server/ratelimit";
import { sallaServices, SERVICE_TYPES, type ServiceType } from "@/lib/server/salla-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salla apps directory (restaurants, services, Salla Care, Salla Go, mall services, Telegram) for a
 * country — no AI, no sign-in. GET /api/services?country=&type=&q=&limit=
 * Ordering and paying happen in the Salla app that `url` opens. CDN-cached 5 minutes.
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "services", 60, 60);
  if (limited) return limited;
  const u = new URL(req.url);
  const c = u.searchParams.get("country")?.toUpperCase();
  const country = isCountryCode(c) ? c : geoFromRequest(req).country;
  const t = u.searchParams.get("type") as ServiceType | null;
  const limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit")) || 30));
  try {
    const r = await sallaServices({ country, type: t && SERVICE_TYPES.includes(t) ? t : undefined, q: (u.searchParams.get("q") ?? "").slice(0, 80), limit });
    return Response.json({ country, ...r }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message, services: [], types: {}, total: 0 }, { status: 500 });
  }
}
