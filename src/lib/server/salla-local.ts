import "server-only";
import type { SallaLocalRaw } from "./browser";
import { cached } from "./cache";
import { kvGet, kvSet } from "./kv";
import { expandQuery } from "./lexicon";
import { haversineKm } from "./rank";
import type { LocalShop } from "../types";

/**
 * Salla Local (mall.salla-shop.com/local): physical shops in Egypt where customers pay
 * in Pi at the counter (scan the shop's code or open its pay page). Shops have no price
 * list, so they are shown as shop cards, not product offers.
 */
export const SALLA_LOCAL_SITE = "https://mall.salla-shop.com/local";

const FRESH_MS = 60 * 60_000;
const STALE_OK_MS = 24 * 60 * 60_000;

/**
 * The shop list needs a headless browser (the most expensive thing the site runs), so it is read
 * at most once an hour for ALL server instances: kept in the database (`kv_cache`) and for 10
 * minutes in each instance's memory. If a read fails, the last list (up to a day old) is used.
 */
export function sallaLocalList(read: () => Promise<SallaLocalRaw[]>): Promise<SallaLocalRaw[]> {
  return cached("salla-local", "all", 10 * 60_000, async () => {
    const hit = await kvGet<SallaLocalRaw[]>("salla_local");
    const have = hit && Array.isArray(hit.value) && hit.value.length ? hit : null;
    if (have && have.ageMs < FRESH_MS) return have.value;
    try {
      const fresh = await read();
      if (fresh.length) await kvSet("salla_local", fresh);
      return fresh.length || !have ? fresh : have.value;
    } catch (e) {
      if (have && have.ageMs < STALE_OK_MS) return have.value;
      throw e;
    }
  });
}

const CALLING: Record<string, string> = { EG: "20", SA: "966", AE: "971", KW: "965", QA: "974", BH: "973", OM: "968", JO: "962", MA: "212", DZ: "213", TN: "216" };

/** "01557137448" / "https://wa.me/2012…" / "+20 12…" → international digits, or undefined when it isn't a real number. */
export function intlDigits(raw: string | undefined, country?: string): string | undefined {
  if (!raw) return;
  const m = raw.match(/wa\.me\/(\d+)/);
  let d = (m ? m[1] : raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && country && CALLING[country]) d = CALLING[country] + d.slice(1);
  d = d.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ");

export function pickLocalShops(
  raw: SallaLocalRaw[],
  opts: { country: string; at?: { lat: number; lon: number }; query?: string; limit?: number },
): { shops: LocalShop[]; matched: boolean } {
  const inCountry = raw.filter((r) => !r.country || r.country === opts.country);
  const shops: LocalShop[] = inCountry.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    address: r.address,
    lat: r.lat,
    lon: r.lon,
    distanceKm:
      opts.at && r.lat != null && r.lon != null && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180
        ? Math.round(haversineKm(opts.at, { lat: r.lat, lon: r.lon }) * 10) / 10
        : undefined,
    phone: intlDigits(r.phone, r.country ?? opts.country),
    whatsapp: intlDigits(r.whatsapp, r.country ?? opts.country),
    url: `${SALLA_LOCAL_SITE}/shop/${r.id}`,
    payUrl: `${SALLA_LOCAL_SITE}/pay/${r.id}`,
  }));
  shops.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  const words = (opts.query ?? "")
    .split(/[,،]/)
    .flatMap((q) => expandQuery(q.trim()))
    .flatMap((q) => norm(q).split(" "))
    .filter((w) => w.length >= 3 && !/^(near|nearby|shop|shops|store|local|قريب|محل|محلات|متجر|جنبي|مني)$/.test(w));
  const hit = (s: LocalShop) => {
    const hay = norm([s.name, s.description, s.address].filter(Boolean).join(" "));
    return words.some((w) => hay.includes(w));
  };
  const matches = words.length ? shops.filter(hit) : [];
  const limit = opts.limit ?? 8;
  return matches.length ? { shops: matches.slice(0, limit), matched: true } : { shops: shops.slice(0, limit), matched: !words.length };
}
