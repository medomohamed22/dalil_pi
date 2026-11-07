import type { Offer, TrustLevel } from "../types";

/**
 * Stores known to accept Pi officially (Pi SDK checkout or an official Pi
 * payment gateway). Everything else starts as "unknown" until the trust
 * score (next phase) proves otherwise.
 */
const PI_VERIFIED = [
  "mall.salla-shop.com", "salla-shop.com", // Salla Shop Mall (Pi SDK, escrow)
  "piketplace.com",                        // Piketplace (Hackathon 2023 runner-up)
  "mapofpi.com",                           // Map of Pi (local shops)
  "pinet.com",                             // Pi Mainnet apps (*.pinet.com)
];

function isPiVerified(domain: string): boolean {
  return PI_VERIFIED.some((v) => domain === v || domain.endsWith("." + v));
}

export interface RawOffer {
  title: string;
  store: string;
  url?: string;
  image?: string;
  price: number;
  currency: string;
  shipping?: number;
  listPrice?: number;
  rating?: number;
  reviewCount?: number;
  distanceKm?: number;
  pickup?: boolean;
  deliveryDays?: number;
  notes?: string;
  /** false when the store says it's out of stock. */
  inStock?: boolean;
  kind?: "online" | "local" | "service";
  piEvidence?: string;
  reviews?: string[];
  address?: string;
  phone?: string;
  lat?: number;
  lon?: number;
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const okCoord = (lat?: number, lon?: number) => typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/** Only dialable characters survive (the value ends up in a tel: link). */
function cleanPhone(p?: string): string | undefined {
  if (typeof p !== "string") return;
  const x = p.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return x.replace(/\D/g, "").length >= 6 && x.length <= 20 ? x : undefined;
}

/** Only plain web links reach the UI (no javascript:, data:, file: …). */
function webUrl(u?: string): string | undefined {
  if (!u || typeof u !== "string") return;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : undefined;
  } catch {
    return;
  }
}

function domainOf(url?: string): string | undefined {
  if (!url) return;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return;
  }
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Deterministic, explainable ranking. The model gathers facts; the score is
 * computed here so it can't be swayed by page content or "sponsored" text.
 *   price 50% · rating 25% (Bayesian-smoothed) · trust 15% · proximity 10%
 * Offers not priced in Pi are flagged and ranked last (they can't be paid with Pi).
 *
 * @param country ISO country the user shops in
 * @param piUsd   live Pi price in USD (OKX) for the "≈ $" hint, if available
 */
export function rankOffers(raw: RawOffer[], country: string, piUsd?: number, coords?: { lat: number; lon: number }): Offer[] {
  const valid = raw
    .filter((r) => r && r.title && isFinite(r.price) && r.price > 0)
    .map((r) => {
      // With the user's GPS and the shop's published location, the server measures the distance itself.
      if (coords && okCoord(r.lat, r.lon)) return { ...r, distanceKm: Math.round(haversineKm(coords, { lat: r.lat!, lon: r.lon! }) * 10) / 10 };
      return r;
    });
  if (!valid.length) return [];

  // Compare prices only within one currency (Pi), so fiat listings don't skew the stats.
  const isPi = (r: RawOffer) => ["PI", "Π"].includes((r.currency || "PI").toUpperCase());
  const priced = valid.some(isPi) ? valid.filter(isPi) : valid;
  const totals = priced.map((r) => r.price + (r.shipping ?? 0));
  const med = median(totals);
  const minT = Math.min(...totals);
  const maxT = Math.max(...totals);

  const offers: Offer[] = valid.map((r, i) => {
    const total = Math.round((r.price + (r.shipping ?? 0)) * 100) / 100;
    const domain = domainOf(r.url);
    const flags: string[] = [];
    const currency = (r.currency || "PI").toUpperCase() === "Π" ? "PI" : (r.currency || "PI").toUpperCase();

    let trust: TrustLevel = domain && isPiVerified(domain) ? "verified" : "unknown";
    if (currency !== "PI") flags.push("not_priced_in_pi");

    // Too-good-to-be-true pricing is the classic fake-store pattern.
    if (priced.length >= 3 && isPi(r) === isPi(priced[0]) && total < med * 0.6) {
      trust = "suspicious";
      flags.push("price_far_below_market");
    }
    // Inflated "was" price → likely fake discount.
    if (r.listPrice && r.listPrice > r.price * 1.5 && (r.reviewCount ?? 0) < 20) {
      flags.push("suspicious_discount");
    }
    if (r.rating && r.rating >= 4.9 && (r.reviewCount ?? 0) > 0 && (r.reviewCount ?? 0) < 15) {
      flags.push("few_perfect_reviews");
    }
    if (!webUrl(r.url)) flags.push("no_source_link");
    if (r.inStock === false) flags.push("out_of_stock");

    const priceScore = !priced.includes(r) ? 0 : maxT === minT ? 1 : Math.max(0, Math.min(1, 1 - (total - minT) / (maxT - minT)));
    // Bayesian average: pull ratings with few reviews toward 3.8.
    const n = r.reviewCount ?? 0;
    const bayes = r.rating ? (r.rating * n + 3.8 * 25) / (n + 25) : 3.5;
    const ratingScore = Math.max(0, Math.min(1, (bayes - 3) / 2));
    const trustScore = trust === "verified" ? 1 : trust === "unknown" ? 0.5 : 0;
    const proximity =
      r.distanceKm != null
        ? Math.max(0, 1 - r.distanceKm / 30)
        : r.deliveryDays != null
          ? Math.max(0, 1 - r.deliveryDays / 10)
          : 0.4;
    let raw01 = 0.5 * priceScore + 0.25 * ratingScore + 0.15 * trustScore + 0.1 * proximity;
    // Never let a too-good-to-be-true deal win on price alone.
    if (trust === "suspicious") raw01 *= 0.3;
    else if (flags.includes("suspicious_discount")) raw01 *= 0.7;
    if (flags.includes("out_of_stock")) raw01 *= 0.2;
    if (flags.includes("not_priced_in_pi")) raw01 *= 0.4;
    const score = Math.round(raw01 * 1000) / 10;

    return {
      id: `o${i}_${Math.random().toString(36).slice(2, 7)}`,
      title: r.title,
      image: webUrl(r.image),
      url: webUrl(r.url),
      store: r.store,
      storeDomain: domain,
      price: r.price,
      currency,
      shipping: r.shipping,
      total,
      totalUsd: currency === "PI" && piUsd ? Math.round(total * piUsd * 100) / 100 : undefined,
      rating: r.rating,
      reviewCount: r.reviewCount,
      distanceKm: r.distanceKm,
      address: typeof r.address === "string" ? r.address.slice(0, 160) : undefined,
      phone: cleanPhone(r.phone),
      lat: okCoord(r.lat, r.lon) ? r.lat : undefined,
      lon: okCoord(r.lat, r.lon) ? r.lon : undefined,
      pickup: r.pickup,
      deliveryDays: r.deliveryDays,
      kind: r.kind,
      country,
      piEvidence: r.piEvidence?.slice(0, 160),
      trust,
      flags,
      badges: [],
      reason: r.notes,
      score,
    };
  });

  offers.sort(
    (a, b) =>
      Number(a.trust === "suspicious") - Number(b.trust === "suspicious") ||
      Number(a.flags.includes("out_of_stock")) - Number(b.flags.includes("out_of_stock")) ||
      Number(a.flags.includes("not_priced_in_pi")) - Number(b.flags.includes("not_priced_in_pi")) ||
      (b.score ?? 0) - (a.score ?? 0),
  );
  // Badges only go to offers you can actually buy.
  const eligible = offers.filter((o) => o.trust !== "suspicious" && !o.flags.includes("out_of_stock") && !o.flags.includes("not_priced_in_pi"));
  const pool = eligible.length ? eligible : offers;

  const cheapest = [...pool].sort((a, b) => a.total - b.total)[0];
  cheapest?.badges.push("cheapest");
  const rated = pool.filter((o) => o.rating);
  const topRated = [...rated].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
  )[0];
  topRated?.badges.push("topRated");
  pool[0]?.badges.unshift("bestValue");
  const near = pool.filter((o) => o.distanceKm != null).sort((a, b) => a.distanceKm! - b.distanceKm!)[0];
  near?.badges.push("nearest");

  return offers;
}
