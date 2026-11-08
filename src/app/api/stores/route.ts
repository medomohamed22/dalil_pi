import { catalogStats } from "@/lib/server/catalog";
import { geoFromRequest, isCountryCode } from "@/lib/server/geo";
import { piUsdPrice } from "@/lib/server/price";
import { rankOffers } from "@/lib/server/rank";
import { scoreTrust } from "@/lib/server/trust";
import { visibleStores } from "@/lib/stores";
import { siteSettings } from "@/lib/server/settings";

export const runtime = "nodejs";

/** The stores directory: every Pi store Dalil Pi knows, with live product counts and trust. Cached 10 min. */
export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get("country")?.toUpperCase();
  const country = isCountryCode(c) ? c : geoFromRequest(req).country;
  const stats = await catalogStats(country).catch(() => []);
  // Store-level trust: the same score as its cards, judged on the store itself (its own site).
  const piUsd = await piUsdPrice().catch(() => null);
  const hidden = new Set((await siteSettings()).hidden_stores);
  const dir = visibleStores(country).filter((d) => !hidden.has(d.id));
  const probe = dir.flatMap((d) => rankOffers([{ title: d.name, store: d.name, url: d.url, price: 1, currency: "PI", kind: d.kind === "local" ? "local" : "online", piEvidence: "Pi store" }], country, piUsd?.usd));
  const scored = await scoreTrust(probe, { neutralPrice: true }).catch(() => []);
  const trust = new Map(scored.map((o, i) => [dir[i].id, o.trustScore ?? null]));
  const stores = dir.map((d) => {
    const st = d.source ? stats.find((s) => s.source === d.source) : undefined;
    return { ...d, products: st?.products ?? null, totalProducts: st?.total ?? null, ageMin: st?.ageMin ?? null, trustScore: trust.get(d.id) ?? null };
  });
  return Response.json({ country, stores }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}
