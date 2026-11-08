import "server-only";
import { fetchWithTimeout } from "./net";
import { supabase, supabaseEnabled } from "./supabase";
import type { Offer, TrustParts } from "../types";

/**
 * Store trust score (0–100), computed on the server so page text or the model
 * can't talk it up:
 *
 *   Trust = round(100 × (0.25·O + 0.20·R + 0.20·W + 0.15·P + 0.10·D + 0.10·F)) − penalties
 *
 *   O official Pi presence   verified Pi marketplace = 1, stated Pi evidence = 0.5, none = 0
 *   R reviews                Bayesian-smoothed rating (few reviews pull toward neutral)
 *   W payment protection     escrow marketplace 0.9, other Pi-verified 0.7, unknown 0.35
 *   P price sanity           near the market median = 1, far below = 0 (fake-deal pattern)
 *   D site                   HTTPS + domain age from public RDAP (old domains score higher);
 *                            physical shops: published address, map location and phone
 *   F fulfilment record      delivered vs. failed/cancelled Dalil Pi orders for this store
 *
 *   80+ very trusted · 60–79 trusted · 40–59 caution (extra confirm) · <40 no Order button
 */
export const TRUST_WEIGHTS = { official: 0.25, reviews: 0.2, wallet: 0.2, price: 0.15, site: 0.1, record: 0.1 } as const;
export const MIN_ORDER_TRUST = 40;

const ESCROW = ["mall.salla-shop.com", "salla-shop.com"];
const PENALTY: Record<string, number> = {
  price_far_below_market: 25,
  no_source_link: 20,
  not_priced_in_pi: 15,
  suspicious_discount: 10,
  few_perfect_reviews: 5,
  price_unverified: 5,
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const onDomain = (d: string | undefined, list: string[]) => !!d && list.some((v) => d === v || d.endsWith("." + v));

/* ---- domain age from RDAP (free, public), cached per server instance ---- */
const ageCache = ((globalThis as unknown as { __dalilAge?: Map<string, { years: number | null; at: number }> }).__dalilAge ??= new Map());

function registrable(host: string): string {
  const parts = host.split(".");
  // good enough for com/net/org/shop and xx.com.eg-style suffixes
  const two = parts.slice(-2).join(".");
  return /^(com|net|org|co|gov|edu)\.[a-z]{2}$/.test(two) && parts.length > 2 ? parts.slice(-3).join(".") : two;
}

export async function domainAgeYears(host: string): Promise<number | null> {
  const d = registrable(host);
  const hit = ageCache.get(d);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.years;
  let years: number | null = null;
  try {
    const r = await fetchWithTimeout(`https://rdap.org/domain/${encodeURIComponent(d)}`, { timeoutMs: 2500, headers: { Accept: "application/rdap+json" } });
    if (r.ok) {
      const j = (await r.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
      const reg = j.events?.find((e) => e.eventAction === "registration")?.eventDate;
      if (reg && !Number.isNaN(Date.parse(reg))) years = (Date.now() - Date.parse(reg)) / (365.25 * 864e5);
    }
  } catch {
    /* unknown age */
  }
  ageCache.set(d, { years, at: Date.now() });
  return years;
}

/* ---- Dalil Pi's own order history per store ---- */
async function fulfilment(domains: string[]): Promise<Map<string, { good: number; bad: number }>> {
  const out = new Map<string, { good: number; bad: number }>();
  if (!supabaseEnabled || !domains.length) return out;
  try {
    const { data } = await supabase().from("orders").select("store_domain, status").in("store_domain", domains).in("status", ["delivered", "paid", "shipped", "failed", "cancelled"]).limit(5000);
    for (const r of data ?? []) {
      const k = r.store_domain as string;
      const cur = out.get(k) ?? { good: 0, bad: 0 };
      if (r.status === "delivered") cur.good++;
      else if (r.status === "failed") cur.bad++;
      out.set(k, cur);
    }
  } catch {
    /* no history */
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function trustFrom(parts: TrustParts, flags: string[]): number {
  const w = TRUST_WEIGHTS;
  const base = 100 * (w.official * parts.official + w.reviews * parts.reviews + w.wallet * parts.wallet + w.price * parts.price + w.site * parts.site + w.record * parts.record);
  const pen = flags.reduce((n, f) => n + (PENALTY[f] ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round(base - pen)));
}

/** Adds trustScore + trustParts to every offer (and the low_trust flag under 40). */
export async function scoreTrust(offers: Offer[], opts: { lookupAge?: boolean } = {}): Promise<Offer[]> {
  const domains = [...new Set(offers.map((o) => o.storeDomain).filter(Boolean) as string[])];
  const { storeSignals } = await import("./community"); // lazy: avoids an import cycle with orders
  const [ages, record, signals] = await Promise.all([
    opts.lookupAge === false ? Promise.resolve(new Map<string, number | null>()) : Promise.all(domains.slice(0, 8).map(async (d) => [d, await domainAgeYears(d)] as const)).then((x) => new Map(x)),
    fulfilment(domains),
    storeSignals(offers.map((o) => ({ domain: o.storeDomain, name: o.store }))).catch(() => new Map()),
  ]);
  const pi = offers.filter((o) => o.currency === "PI").map((o) => o.total);
  const med = median(pi.length ? pi : offers.map((o) => o.total));

  return offers.map((o) => {
    const d = o.storeDomain;
    // A Pi payment method in the store's own checkout is first-hand evidence it takes Pi.
    const official = o.trust === "verified" ? 1 : o.checkout === "woo_pi" ? 0.8 : o.piEvidence ? 0.5 : 0;
    const sig = signals.get(o.storeDomain ?? o.store.toLowerCase());
    // Verified Dalil Pi buyer reviews count 3× a store-page review.
    const dn = (sig?.reviews ?? 0) * 3;
    const n = (o.reviewCount ?? 0) + dn;
    const sum = (o.rating ?? 0) * (o.reviewCount ?? 0) + (sig?.avg ?? 0) * dn;
    const bayes = n ? (sum + 3.6 * 20) / (n + 20) : o.rating ? o.rating : 3.4;
    const reviews = clamp01((bayes - 2.5) / 2.5);
    const wallet = onDomain(d, ESCROW) ? 0.9 : o.trust === "verified" ? 0.7 : o.checkout === "woo_pi" ? 0.6 : 0.35;
    const ratio = med > 0 ? o.total / med : 1;
    const price = (pi.length || offers.length) < 3 ? 0.7 : ratio < 0.6 ? 0 : ratio < 0.8 ? 0.6 : ratio > 1.8 ? 0.6 : 1;
    const age = d ? ages.get(d) : null;
    // A physical shop is judged on its published whereabouts, not on having a website.
    const physical = (o.kind === "local" || o.kind === "service") && !o.url;
    const site = physical
      ? (o.address ? 0.35 : 0) + (o.lat != null ? 0.25 : 0) + (o.phone ? 0.2 : 0)
      : (o.url?.startsWith("https://") ? 0.5 : 0) + (age == null ? 0.2 : age >= 5 ? 0.5 : age >= 2 ? 0.4 : age >= 1 ? 0.25 : 0);
    const h = d ? record.get(d) : undefined;
    const record01 = (((h?.good ?? 0) + 1) / ((h?.good ?? 0) + (h?.bad ?? 0) + 2));
    const parts: TrustParts = {
      official,
      reviews: Math.round(reviews * 100) / 100,
      wallet,
      price,
      site: Math.round(clamp01(site) * 100) / 100,
      record: Math.round(record01 * 100) / 100,
    };
    const flags = physical ? o.flags.filter((f) => f !== "no_source_link") : [...o.flags];
    if (age != null && age < 0.5 && !flags.includes("new_domain")) flags.push("new_domain");
    let trustScore = trustFrom(parts, flags);
    if (flags.includes("new_domain")) trustScore = Math.max(0, trustScore - 10);
    // Problems reported by Dalil Pi buyers: −10 each (max −40); 3+ = not recommended.
    if (sig?.disputes) {
      trustScore = Math.max(0, trustScore - Math.min(40, sig.disputes * 10));
      if (sig.disputes >= 3) {
        trustScore = Math.min(trustScore, 35);
        if (!flags.includes("many_complaints")) flags.push("many_complaints");
      }
    }
    if (o.trust === "suspicious") trustScore = Math.min(trustScore, 30);
    if (trustScore < MIN_ORDER_TRUST && !flags.includes("low_trust")) flags.push("low_trust");
    return { ...o, flags, trustScore, trustParts: parts, ...(sig && (sig.reviews || sig.disputes) ? { dalilReviews: { count: sig.reviews, avg: sig.avg, disputes: sig.disputes } } : {}) };
  });
}
