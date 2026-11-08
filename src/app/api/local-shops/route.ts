import { BrowserSession } from "@/lib/server/browser";
import { cached } from "@/lib/server/cache";
import { geoFromRequest, isCountryCode } from "@/lib/server/geo";
import { rateLimit } from "@/lib/server/ratelimit";
import { pickLocalShops } from "@/lib/server/salla-local";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Shops near the user that take Pi at the counter (Salla Local), no AI.
 * GET /api/local-shops?lat=&lon=&q=&country= — the shop list is read at most every 15 min.
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "local", 30, 60);
  if (limited) return limited;
  const u = new URL(req.url);
  const geo = geoFromRequest(req);
  const c = u.searchParams.get("country")?.toUpperCase();
  const country = isCountryCode(c) ? c : geo.country;
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  const gps = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
  const at = gps ? { lat, lon } : country === geo.country && geo.lat != null && geo.lon != null ? { lat: geo.lat, lon: geo.lon } : undefined;
  try {
    const raw = await cached("salla-local", "all", 15 * 60_000, async () => {
      const b = new BrowserSession();
      try {
        return await b.sallaLocalShops();
      } finally {
        await b.close();
      }
    });
    const { shops, matched } = pickLocalShops(raw, { country, at, query: (u.searchParams.get("q") ?? "").slice(0, 60), limit: 20 });
    return Response.json({ country, shops, matched, locatedBy: gps ? "gps" : at ? "ip" : null }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message, shops: [] }, { status: 502 });
  }
}
