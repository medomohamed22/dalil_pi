import { after } from "next/server";
import { refreshInBackground, SOURCES, type CatalogSource } from "@/lib/server/catalog";
import { geoFromRequest, isCountryCode } from "@/lib/server/geo";
import { visitorId } from "@/lib/server/hosted";
import { rateLimit } from "@/lib/server/ratelimit";
import { counters } from "@/lib/server/store";
import { searchShop, type ShopSort } from "@/lib/server/shop";
import { recordMiss } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS: ShopSort[] = ["best", "cheapest", "trust", "newest"];
const n = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);

/**
 * Instant product search in Dalil Index — no AI, no sign-in, no credit used.
 * GET /api/search?q=&country=&store=&category=&sort=&min=&max=&stock=1&any=a|b&offset=&limit=
 * Public and identical for everyone with the same URL, so the CDN keeps it 10 minutes and then serves the old copy while it fetches a new one (stores are re-read hourly).
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "search", 90, 60);
  if (limited) return limited;
  const u = new URL(req.url);
  const c = u.searchParams.get("country")?.toUpperCase();
  const country = isCountryCode(c) ? c : geoFromRequest(req).country;
  const store = u.searchParams.get("store") as CatalogSource | null;
  const sort = u.searchParams.get("sort") as ShopSort | null;
  try {
    const result = await searchShop({
      q: (u.searchParams.get("q") ?? "").slice(0, 120),
      cats: (u.searchParams.get("cat") ?? "").split(",").map((x) => x.trim()).filter((x) => /^[a-z_]{2,20}$/.test(x)).slice(0, 4),
      any: (u.searchParams.get("any") ?? "").split("|").map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 14),
      country,
      store: store && SOURCES.includes(store) ? store : undefined,
      category: u.searchParams.get("category")?.slice(0, 80) || undefined,
      sort: sort && SORTS.includes(sort) ? sort : undefined,
      min: n(u.searchParams.get("min")),
      max: n(u.searchParams.get("max")),
      inStock: u.searchParams.get("stock") === "1",
      deals: u.searchParams.get("deals") === "1",
      offset: n(u.searchParams.get("offset")),
      limit: n(u.searchParams.get("limit")),
    });
    // Keep the index fresh without making anyone wait (the JSON stores; Salla is refreshed elsewhere).
    after(() => refreshInBackground(["pcm", "gtp", "pkt"]));
    // Nothing found for a typed search (no narrowing filters): record the demand gap.
    const typed = result.parsed.text;
    // At most 20 recorded per visitor per hour (counted in the database, across all server
    // instances; only searches with no result pay this extra call): random queries can't flood it.
    if (typed && result.total === 0 && !store && !u.searchParams.get("category") && !u.searchParams.get("offset")) {
      const who = visitorId(req);
      after(async () => {
        if ((await counters.incr(`miss:${who}:${Math.floor(Date.now() / 3_600_000)}`, 3700).catch(() => 99)) <= 20) await recordMiss(typed, country).catch(() => {});
      });
    }
    return Response.json({ country, ...result }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
