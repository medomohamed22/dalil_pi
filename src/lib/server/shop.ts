import "server-only";
import { cached, norm } from "./cache";
import { catalogCategories, catalogItem, searchCatalog, SOURCES, twinsOf, type CatalogSource, type IndexHit } from "./catalog";
import { priceStats } from "./community";
import { normUrl } from "./evidence";
import { piUsdPrice } from "./price";
import { rankOffers, type RawOffer } from "./rank";
import { prepareOffers } from "./sign";
import { MIN_ORDER_TRUST, scoreTrust } from "./trust";
import { ruleCategory } from "./rules";
import type { Offer } from "../types";

/**
 * Shop search — the no-AI path. A request like "سماعة بلوتوث تحت 300 باي" is read with plain
 * rules (budget, "cheapest"), searched in Dalil Index, scored for trust and signed, so the
 * cards can Order / Watch / Add to cart exactly like the AI's cards. No model call, no credit.
 */

export type ShopSort = "best" | "cheapest" | "trust" | "newest";

export interface ParsedQuery {
  text: string;
  min?: number;
  max?: number;
  sort?: ShopSort;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toNum = (s: string) => Number(s.replace(",", "."));
/** Arabic-Indic digits → Latin, so "٣٠٠" reads as 300. */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** Budget and sort words out of a free-text query; what's left is the product. */
export function parseQuery(raw: string): ParsedQuery {
  let q = ` ${latinDigits(raw).replace(/\s+/g, " ").trim()} `;
  const out: ParsedQuery = { text: "" };
  const unit = String.raw`\s*(?:π|pi|باي|بای)?`;
  const take = (re: RegExp, set: (m: RegExpMatchArray) => void) => {
    const m = q.match(re);
    if (m) {
      set(m);
      q = q.replace(m[0], " ");
    }
  };
  take(new RegExp(String.raw`(?:between|من|بين)\s*${NUM}${unit}\s*(?:and|-|to|و|ل|الى|إلى|لحد)\s*${NUM}${unit}`, "i"), (m) => {
    out.min = toNum(m[1]);
    out.max = toNum(m[2]);
  });
  take(new RegExp(String.raw`(?:under|below|less than|max|up to|<|≤|تحت|اقل من|أقل من|بحد اقصى|بحد أقصى|لحد|في حدود|ب|بـ)\s*${NUM}${unit}`, "i"), (m) => (out.max = toNum(m[1])));
  take(new RegExp(String.raw`(?:over|above|more than|min|>|≥|فوق|اكثر من|أكثر من)\s*${NUM}${unit}`, "i"), (m) => (out.min = toNum(m[1])));
  take(/(?:^|\s)(cheapest|cheap|lowest price|ارخص|أرخص|الارخص|الأرخص|رخيص|رخيصه|رخيصة)(?=\s|$)/i, () => (out.sort = "cheapest"));
  take(/(?:^|\s)(newest|latest|جديد|احدث|أحدث)(?=\s|$)/i, () => (out.sort = "newest"));
  take(/(?:^|\s)(most trusted|safest|اوثق|أوثق|موثوق)(?=\s|$)/i, () => (out.sort = "trust"));
  out.text = q.replace(/\s+/g, " ").trim();
  if (out.min != null && out.max != null && out.min > out.max) [out.min, out.max] = [out.max, out.min];
  return out;
}

export interface ShopFilters {
  q?: string;
  /** Several phrasings at once (category tiles: ["perfume", "عطر", "fragrance"]). */
  any?: string[];
  /** AI-normalized categories (enrich.ts), e.g. ["phones"]. */
  cats?: string[];
  country: string;
  store?: CatalogSource;
  category?: string;
  sort?: ShopSort;
  min?: number;
  max?: number;
  inStock?: boolean;
  /** Only discounted products (a "was" price or a recent drop), biggest discount first. */
  deals?: boolean;
  limit?: number;
  offset?: number;
}

export interface ShopResult {
  offers: Offer[];
  total: number;
  /** Results per store before the store filter (for the store chips). */
  stores: Record<string, number>;
  categories: string[];
  parsed: ParsedQuery;
  ms: number;
}

function toRaw(h: IndexHit, country: string): RawOffer {
  const it = h.item;
  const ship = it.shipping && country in it.shipping ? it.shipping[country] : undefined;
  return {
    title: it.title,
    store: it.seller && it.source !== "salla" ? `${h.store} · ${it.seller}` : h.store,
    url: it.url,
    image: it.image ?? undefined,
    price: h.price,
    currency: "PI",
    listPrice: h.listPrice,
    shipping: ship,
    inStock: it.in_stock,
    kind: it.digital ? "service" : "online",
    notes: it.source === "pcm" ? (it.ships_global ? "Global sale" : undefined) : undefined,
    piEvidence: `Pi price from ${h.store}'s catalog`,
  };
}

export interface ProductPage {
  offer: Offer;
  images: string[];
  description?: string;
  title_ar?: string;
  title_en?: string;
  brand?: string;
  model?: string;
  category?: string;
  stock?: number;
  similar: Offer[];
}

/** One product of Dalil Index as a full page: signed offer + photos + same product elsewhere + similar. */
export async function productPage(id: string, country: string): Promise<ProductPage | null> {
  const hit = await catalogItem(id, country);
  if (!hit) return null;
  const piUsd = await piUsdPrice().catch(() => null);
  const ranked = rankOffers([toRaw(hit, country)], country, piUsd?.usd).map((o) => ({ ...o, badges: [] as string[] }));
  const [scored] = await scoreTrust(ranked, { neutralPrice: true });
  if (!scored) return null;
  const stats = await priceStats([scored.url ?? ""]).catch(() => new Map());
  const st = scored.url ? stats.get(normUrl(scored.url) ?? "") : undefined;
  if (st) scored.priceStats = st;
  if (hit.listPrice && hit.listPrice > scored.price) scored.listPrice = Math.round(hit.listPrice * 100) / 100;
  scored.ref = hit.item.id;
  const tw = await twinsOf(hit.item.id, country);
  if (tw.length) scored.twins = tw.map((t) => ({ store: t.item.seller && t.item.source !== "salla" ? `${t.store} · ${t.item.seller}` : t.store, title: t.item.title, url: t.item.url, total: t.price, ref: t.item.id }));
  const [offer] = prepareOffers([scored]);
  // Similar: the same AI category, else words from the title; never itself or its twins.
  const it = hit.item;
  const skip = new Set([it.id, ...tw.map((t) => t.item.id)]);
  const STOPW = /^(offer|offers|featuring|products?|based|original|quality|premium|new|best|with|from|pack|set|piece|pieces|size|color|colour|for|and|the|عرض|منتج|منتجات|اصلي|جديد|مع|من|على|جودة|عالية|خامة)$/i;
  const words = (it.title_en || it.title)
    .split(/[\s\-_/|,.()]+/)
    .filter((w) => w.length > 3 && !STOPW.test(w) && !/\d/.test(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  // Best: the AI category; else the store's own category; else the product's meaningful words.
  const simQuery: ShopFilters =
    it.norm_category && it.norm_category !== "other"
      ? { country, cats: [it.norm_category], limit: 12 }
      : it.category
        ? { country, store: it.source, category: it.category, limit: 12 }
        : { country, any: words, limit: 12 };
  const sim = await searchShop(simQuery).catch(() => null);
  return {
    offer,
    images: it.images?.length ? it.images : it.image ? [it.image] : [],
    description: it.description ?? undefined,
    title_ar: it.title_ar ?? undefined,
    title_en: it.title_en ?? undefined,
    brand: it.brand ?? undefined,
    model: it.model ?? undefined,
    category: it.norm_category ?? it.category ?? undefined,
    stock: it.stock ?? undefined,
    similar: (sim?.offers ?? []).filter((o) => !o.ref || !skip.has(o.ref)).slice(0, 8),
  };
}

export async function searchShop(f: ShopFilters): Promise<ShopResult> {
  const t0 = Date.now();
  const parsed = parseQuery(f.q ?? "");
  const min = f.min ?? parsed.min;
  const max = f.max ?? parsed.max;
  const sort = f.sort ?? parsed.sort ?? "best";
  const queries = [parsed.text, ...(f.any ?? [])].filter(Boolean);
  // A short search that names a kind of product ("سماعة", "perfume", "موبايل") also brings the whole
  // category the rules put products in, even when a title says it differently ("earbuds").
  const kind = !f.cats?.length && parsed.text && parsed.text.split(/\s+/).length <= 2 ? ruleCategory({ title: parsed.text }) : null;
  const cats = f.cats?.length ? f.cats : kind ? [kind] : undefined;
  const browse = !queries.length;

  // The heavy part (match + trust + sign) depends only on the words, country and store → cached.
  const base = await cached("shop", `${f.country}|${f.store ?? "*"}|${norm(f.category ?? "")}|${(cats ?? []).join(",")}|${queries.map(norm).join("+")}`, 5 * 60_000, async () => {
    const [{ hits }, piUsd] = await Promise.all([
      searchCatalog(queries, { country: f.country, limit: 400, browse: browse && !cats?.length, category: f.category, cats }),
      piUsdPrice().catch(() => null),
    ]);
    const relevance = new Map(hits.map((h, i) => [h.item.url, { score: h.score, rank: i, ageMin: h.ageMin, source: h.item.source, listPrice: h.listPrice }]));
    // Each product on its own: a shop list mixes tea and phones, so no "price far below the
    // others" judgement between them (that check is for the same product in several stores).
    const ranked = hits.flatMap((h) => rankOffers([toRaw(h, f.country)], f.country, piUsd?.usd)).map((o) => ({ ...o, badges: [] as string[] }));
    const scored = await scoreTrust(ranked, { neutralPrice: true });
    const stats = await priceStats(scored.map((o) => o.url ?? "").filter(Boolean)).catch(() => new Map());
    for (const o of scored) {
      const st = o.url ? stats.get(normUrl(o.url) ?? "") : undefined;
      if (st) o.priceStats = st;
    }
    const byUrl = new Map(hits.map((h) => [h.item.url, h.item]));
    await Promise.all(
      scored.map(async (o) => {
        const lp = relevance.get(o.url ?? "")?.listPrice;
        if (lp && lp > o.price) o.listPrice = Math.round(lp * 100) / 100;
        const it = byUrl.get(o.url ?? "");
        if (!it) return;
        o.ref = it.id;
        // Same brand + model elsewhere (from the AI enrichment), cheapest first.
        const tw = it.twin_key ? await twinsOf(it.id, f.country) : [];
        if (tw.length) o.twins = tw.map((t) => ({ store: t.item.seller && t.item.source !== "salla" ? `${t.store} · ${t.item.seller}` : t.store, title: t.item.title, url: t.item.url, total: t.price, ref: t.item.id }));
      }),
    );
    const signed = prepareOffers(scored);
    return signed.map((o) => ({ o, ...(relevance.get(o.url ?? "") ?? { score: 0, rank: 9999, ageMin: -1, source: "pcm" as CatalogSource, listPrice: undefined }) }));
  });

  const stores: Record<string, number> = {};
  for (const s of SOURCES) stores[s] = 0;
  let list = base.filter(({ o }) => (min == null || o.total >= min) && (max == null || o.total <= max) && (!f.inStock || !o.flags.includes("out_of_stock")));
  for (const x of list) stores[x.source] = (stores[x.source] ?? 0) + 1;
  if (f.store) list = list.filter((x) => x.source === f.store);
  const off = (o: Offer) => Math.max(o.listPrice && o.listPrice > o.price ? 1 - o.price / o.listPrice : 0, o.priceStats && o.priceStats.avg > o.price ? 1 - o.price / o.priceStats.avg : 0);
  if (f.deals) list = list.filter((x) => off(x.o) >= 0.03).sort((a, b) => off(b.o) - off(a.o));

  const blocked = (o: Offer) => Number(o.trust === "suspicious" || (o.trustScore ?? 50) < MIN_ORDER_TRUST || o.flags.includes("out_of_stock"));
  const by: Record<ShopSort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
    best: (a, b) => a.rank - b.rank,
    cheapest: (a, b) => a.o.total - b.o.total,
    trust: (a, b) => (b.o.trustScore ?? 0) - (a.o.trustScore ?? 0) || a.rank - b.rank,
    newest: (a, b) => a.rank - b.rank,
  };
  if (!f.deals) list = [...list].sort((a, b) => blocked(a.o) - blocked(b.o) || by[sort](a, b));

  // Badges on the merits of this list: best match on top, cheapest buyable.
  const ok = list.filter((x) => !blocked(x.o));
  const top = sort === "best" && queries.length ? ok[0] : undefined;
  const cheap = ok.length > 1 ? ok.reduce((a, b) => (b.o.total < a.o.total ? b : a)) : undefined;
  list = list.map((x) => {
    const badges = [...(x === top ? ["bestValue"] : []), ...(x === cheap ? ["cheapest"] : [])];
    return badges.length || x.o.badges.length ? { ...x, o: { ...x.o, badges } } : x;
  });

  const offset = Math.max(0, f.offset ?? 0);
  const limit = Math.min(60, Math.max(1, f.limit ?? 24));
  const page = list.slice(offset, offset + limit).map((x) => x.o);
  return {
    offers: page,
    total: list.length,
    stores,
    categories: f.store ? await catalogCategories(f.country, f.store) : [],
    parsed: { ...parsed, min, max, sort },
    ms: Date.now() - t0,
  };
}
