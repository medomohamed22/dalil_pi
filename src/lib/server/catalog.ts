import "server-only";
import { createHash } from "node:crypto";
import { BrowserSession, browserAvailable, type SallaCatalogRaw } from "./browser";
import { expandQuery, synonymGroups } from "./lexicon";
import { fetchWithTimeout, assertPublicUrl } from "./net";
import { attachMemoryCatalog, type MemCatalogRow } from "./enrich";
import { ruleCategory, ruleTwinKey } from "./rules";
import { countryCode, PCM_COUNTRY_IDS } from "./partners";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Dalil Index — our own copy of the public catalogs of trusted Pi stores.
 *
 *   1. Fetch (plain code, no AI): read each store's whole public catalog —
 *        Pi Chain Mall   3 small JSON pages (the list its own app loads)
 *        Global Trade Pi 1 JSON page
 *        Salla Shop Mall its /products page (one headless render loads every product)
 *   2. Store: upsert into catalog_items; products that vanished become inactive.
 *   3. Search: an in-memory index per server instance (reloaded only when a store
 *      was refreshed), Arabic/English normalisation, the AR↔EN lexicon and typo
 *      tolerance. ~300 products today → well under a millisecond per search.
 *
 * Refresh: lazily after a search when a store's copy is older than its TTL (the
 * reply is never delayed), from /api/cron/catalog (GitHub Actions / Vercel Cron),
 * or forced. A lock row per store stops two instances refreshing at once.
 */

export type CatalogSource = "pcm" | "salla" | "gtp" | "pkt";
export const SOURCES: CatalogSource[] = ["pcm", "salla", "gtp", "pkt"];
/** How old a store's copy may get before a search triggers a background refresh. */
// Piketplace pages are heavy (~450 kB each, the country list rides along), so it is read less often.
export const TTL_MIN: Record<CatalogSource, number> = { pcm: 60, gtp: 60, salla: 180, pkt: 360 };
const STORE_NAME: Record<CatalogSource, string> = { pcm: "Pi Chain Mall", salla: "Salla Shop Mall", gtp: "Global Trade Pi", pkt: "Piketplace" };

export interface CatalogItem {
  id: string;
  source: CatalogSource;
  title: string;
  title_ar?: string | null;
  description?: string | null;
  price?: number | null;
  price_egp?: number | null;
  list_price_egp?: number | null;
  url: string;
  image?: string | null;
  images: string[];
  seller?: string | null;
  country?: string | null;
  category?: string | null;
  tags: string[];
  in_stock: boolean;
  stock?: number | null;
  digital: boolean;
  /** Ships to every country (Pi Chain Mall "global sale"); otherwise only `country`. */
  ships_global?: boolean;
  /** Countries it ships to → fee in Pi (0 = free). Empty = only `country` (local / pickup). */
  shipping?: Record<string, number> | null;
  /** Filled once per product by AI (enrich.ts). */
  brand?: string | null;
  model?: string | null;
  norm_category?: string | null;
  title_en?: string | null;
  keywords?: string[] | null;
  /** brand|model — the same product in other stores shares it. */
  twin_key?: string | null;
}

interface SourceState {
  source: CatalogSource;
  refreshed_at: string | null;
  items: number;
  ok: boolean | null;
  error: string | null;
  meta: { usd_rate?: number; profit_percentage?: number; pi_price_cache?: number; enriched_at?: string };
}

/* ------------------------------------------------------------------ */
/* 1. Fetchers (plain code)                                            */
/* ------------------------------------------------------------------ */

const allowPrivate = () => !process.env.VERCEL && process.env.DALIL_TEST_ALLOW_PRIVATE_STORES === "1";
const UA = "Mozilla/5.0 (compatible; DalilPiBot/1.0; +https://pihackathontest.vercel.app)";

async function getJson<T>(url: string): Promise<T> {
  if (!allowPrivate()) await assertPublicUrl(url);
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json", "User-Agent": UA }, redirect: "error", timeoutMs: 8000 });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

const str = (v: unknown, max = 400) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const httpsImg = (v: unknown) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v.trim()) ? v.trim() : null);
const base = (v?: string) => (v ? v.replace(/\/+$/, "") : "");

/**
 * Pi Chain Mall: the product list its own app loads (500 per page), then the lists of the
 * countries we can place (PCM_COUNTRY_IDS) to learn where each local listing is sold.
 */
export async function fetchPcm(): Promise<CatalogItem[]> {
  const api = base(process.env.PCM_API_URL) || "https://api.pipcm.com";
  const where = new Map<string, string>();
  for (const [pcmId, iso] of Object.entries(PCM_COUNTRY_IDS)) {
    for (let page = 1, pages = 1; page <= Math.min(pages, 20); page++) {
      const u = new URL(`${api}/api/commodity/commodity/getCommodityList`);
      for (const [k, v] of Object.entries({ currentPage: String(page), pageSize: "500", countryId: pcmId, hasStock: "false", commdityMark: "-1" })) u.searchParams.set(k, v);
      const j = await getJson<{ object?: Array<Record<string, unknown>>; totalPage?: number }>(u.toString());
      pages = Number(j.totalPage) || 1;
      const rows = Array.isArray(j.object) ? j.object : [];
      for (const c of rows) if (typeof c.id === "string") where.set(c.id, iso);
      if (!rows.length) break;
    }
  }
  const img = (p: string) => (/^https?:\/\//.test(p) ? p : `https://image.pcmsuper.art/image/${p.replace(/^\/+/, "")}`);
  const out: CatalogItem[] = [];
  const seen = new Set<string>(); // its pages can repeat items
  for (let page = 1, pages = 1; page <= Math.min(pages, 40); page++) {
    const u = new URL(`${api}/api/commodity/commodity/getCommodityList`);
    // Big pages: its small pages overlap (some items repeat, others never show), one big page doesn't.
    for (const [k, v] of Object.entries({ currentPage: String(page), pageSize: "500", countryId: "globle8787", hasStock: "false", commdityMark: "-1" })) u.searchParams.set(k, v);
    const j = await getJson<{ object?: Array<Record<string, unknown>>; totalPage?: number }>(u.toString());
    pages = Number(j.totalPage) || 1;
    const rows = Array.isArray(j.object) ? j.object : [];
    for (const c of rows) {
      const id = str(c.id, 64);
      const title = str(c.title, 200);
      const price = num(c.price);
      if (!id || !/^[\w-]+$/.test(id) || !title || !(price && price > 0) || (c.status ?? 0) !== 0 || seen.has(id)) continue;
      seen.add(id);
      const pics = (Array.isArray(c.urlList) ? c.urlList : [c.pictureUrl]).map((p) => (typeof p === "string" && p.trim() ? httpsImg(img(p.trim())) : null)).filter(Boolean) as string[];
      const user = (c.tUserEntity ?? {}) as Record<string, unknown>;
      out.push({
        id: `pcm:${id}`,
        source: "pcm",
        title,
        url: `https://pipcm.com/#/product/new-detail?id=${encodeURIComponent(id)}${str(c.userId, 64) ? `&userId=${encodeURIComponent(String(c.userId))}` : ""}`,
        price,
        image: pics[0] ?? null,
        images: pics.slice(0, 8),
        seller: str(user.nickName, 60) ?? str(user.userName, 60),
        // Local listings: only their sales country (unknown → shown nowhere); global sale: everywhere.
        country: where.get(id) ?? null,
        ships_global: c.commdityMark === 1,
        tags: [],
        in_stock: true,
        digital: false,
      });
    }
    if (!rows.length) break;
  }
  return out;
}

/** Global Trade Pi: its public product list. */
export async function fetchGtp(): Promise<CatalogItem[]> {
  const api = base(process.env.GTP_API_URL) || "https://globaltradepi.xyz";
  const out: CatalogItem[] = [];
  for (let page = 1, pages = 1; page <= Math.min(pages, 20); page++) {
    const j = await getJson<{ products?: Array<Record<string, unknown>>; pagination?: { totalPages?: number } }>(`${api}/api/products?page=${page}&limit=50`);
    pages = Number(j.pagination?.totalPages) || 1;
    const rows = Array.isArray(j.products) ? j.products : [];
    for (const p of rows) {
      const id = str(p._id ?? p.id, 64);
      const title = str(p.title, 200);
      const price = num(p.price);
      if (!id || !/^[a-f0-9]{24}$/i.test(id) || !title || !(price && price > 0) || (p.status && p.status !== "active") || p.sellingType === "auction") continue;
      const pics = (Array.isArray(p.images) ? p.images : []).map(httpsImg).filter(Boolean) as string[];
      out.push({
        id: `gtp:${id}`,
        source: "gtp",
        title,
        description: str(p.description, 400),
        url: `https://globaltradepi.xyz/products/${id}`,
        price,
        image: pics[0] ?? null,
        images: pics.slice(0, 8),
        seller: str(p.sellerUsername, 60),
        country: countryCode(str(p.country, 60) ?? undefined) ?? null,
        category: str(p.category, 60),
        tags: [],
        in_stock: p.stock == null || Number(p.stock) > 0,
        stock: num(p.stock),
        digital: p.productType === "digital",
      });
    }
    if (!rows.length) break;
  }
  return out;
}

/**
 * Piketplace (mpiket.pinet.com, the Pi Mainnet app of piketplace.com): the product list its app
 * loads for visitors, filtered to the countries Dalil Pi serves (PIKET_COUNTRIES, default EG) —
 * the whole catalog is ~2,600 products in 450 kB pages, Egypt's share ~740. Pages are read 5 at
 * a time. Each listing says which countries it ships to and the fee in Pi.
 */
export async function fetchPkt(): Promise<CatalogItem[]> {
  const api = base(process.env.PKT_API_URL) || "https://mainnet-backend.piketplace.com/api/v1";
  const countries = (process.env.PIKET_COUNTRIES || "EG").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 6);
  const iso3 = (c: string) => ({ EG: "EGY", SA: "SAU", AE: "ARE", NG: "NGA", MA: "MAR", DZ: "DZA", TN: "TUN", JO: "JOR", KW: "KWT", QA: "QAT", IQ: "IRQ", VN: "VNM", US: "USA", IN: "IND", PH: "PHL" })[c] ?? c;
  const url = (c: string, page: number) => {
    const u = new URL(`${api}/index-loading`);
    const q: Record<string, string> = { page: String(page), status: "validated", verified_shops: "1", locale: "en", "filter[iso2]": c, "filter[iso3]": iso3(c), "filter[show_products_type]": "all", "filter[sort_by]": "recent", "filter[is_updated]": "0" };
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    return u.toString();
  };
  type Page = { products?: { data?: Array<Record<string, unknown>>; last_page?: number } };
  const rows = new Map<string, Record<string, unknown>>();
  for (const c of countries) {
    const first = await getJson<Page>(url(c, 1));
    for (const r of first.products?.data ?? []) rows.set(String(r.id), r);
    const last = Math.min(Number(first.products?.last_page) || 1, 60);
    const pages = Array.from({ length: last - 1 }, (_, i) => i + 2);
    for (let i = 0; i < pages.length; i += 5) {
      const got = await Promise.all(pages.slice(i, i + 5).map((pg) => getJson<Page>(url(c, pg)).catch(() => ({}) as Page)));
      for (const g of got) for (const r of g.products?.data ?? []) rows.set(String(r.id), r);
    }
  }
  const out: CatalogItem[] = [];
  for (const r of rows.values()) {
    const id = String(r.id ?? "");
    const title = str(r.libelle, 200);
    const price = num(r.price);
    // Sub-cent prices (0.0000014 π) are placeholders, not real offers.
    if (!/^\d{1,10}$/.test(id) || !title || !(price && price >= 0.01) || (r.status && r.status !== "validated")) continue;
    const pics = [r.imageFirst, ...(Array.isArray(r.images) ? r.images.map((x) => (x as { lien?: string })?.lien) : [])].map(httpsImg).filter(Boolean) as string[];
    const shipping: Record<string, number> = {};
    for (const z of Array.isArray(r.shipping_zone) ? r.shipping_zone : []) {
      const cc = String((z as { country_code?: string }).country_code ?? "").toUpperCase();
      const fee = num((z as { fee_pi?: unknown }).fee_pi);
      if (/^[A-Z]{2}$/.test(cc) && fee != null && fee >= 0 && !(cc in shipping)) shipping[cc] = Math.round(fee * 100) / 100;
    }
    for (const cc of Array.isArray(r.shippingCountries) ? r.shippingCountries : []) if (/^[A-Z]{2}$/.test(String(cc)) && !(String(cc) in shipping)) shipping[String(cc)] = r.free_shipping ? 0 : (shipping[String(cc)] ?? 0);
    for (const cc of Array.isArray(r.freeShippingCountries) ? r.freeShippingCountries : []) if (/^[A-Z]{2}$/.test(String(cc))) shipping[String(cc)] = 0;
    const user = (r.user ?? {}) as Record<string, unknown>;
    const qty = num(r.quantity);
    out.push({
      id: `pkt:${id}`,
      source: "pkt",
      title,
      description: str(r.description, 400),
      url: `https://mpiket.pinet.com/product/${id}`,
      price,
      image: pics[0] ?? null,
      images: [...new Set(pics)].slice(0, 8),
      seller: str(user.shopNameShow, 60) ?? str(user.username, 60),
      country: str(r.country_code, 2)?.toUpperCase() ?? null,
      tags: [],
      in_stock: qty == null || qty > 0,
      stock: qty,
      digital: false, // see reaches(): the seller's "digital" tick is unreliable there
      shipping,
    });
  }
  return out;
}

/** Salla Shop Mall: every product its /products page loads (prices in EGP + its EGP→Pi settings). */
export function parseSalla(raw: SallaCatalogRaw): { items: CatalogItem[]; meta: SourceState["meta"] } {
  const items: CatalogItem[] = [];
  for (const r of raw.rows) {
    const id = str(r.id, 64);
    const name = str(r.name, 200);
    const egp = num(r.local_price_egp);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !name || !(egp && egp > 0) || r.in_stock === false) continue;
    const was = num(r.original_price);
    const cat = (r.categories ?? {}) as Record<string, unknown>;
    const pics = [r.image, ...(Array.isArray(r.images) ? r.images : [])].map(httpsImg).filter(Boolean) as string[];
    items.push({
      id: `salla:${id}`,
      source: "salla",
      title: name,
      title_ar: str(r.name_ar, 200),
      description: [str(r.description, 300), str(r.description_ar, 300)].filter(Boolean).join(" — ") || null,
      url: `https://mall.salla-shop.com/product/${id}`,
      price_egp: egp,
      list_price_egp: was && was > egp ? was : null,
      image: pics[0] ?? null,
      images: [...new Set(pics)].slice(0, 8),
      category: [str(cat.name, 60), str(r.category, 60)].filter(Boolean).join(" / ") || null,
      tags: (Array.isArray(r.tags) ? r.tags : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 10) as string[],
      in_stock: r.in_stock !== false && (num(r.stock_quantity) ?? 1) > 0,
      stock: num(r.stock_quantity),
      digital: false,
    });
  }
  const s = raw.settings ?? {};
  return { items, meta: { usd_rate: num(s.usd_rate) ?? undefined, profit_percentage: num(s.profit_percentage) ?? undefined, pi_price_cache: num(s.pi_price_cache) ?? undefined } };
}

/**
 * Salla Shop's partner API (docs/salla-partner): the same catalog as JSON in ~1 s, no browser.
 * Used when SALLA_API_URL + SALLA_API_KEY are set; the headless page read stays the fallback.
 */
export async function fetchSallaApi(): Promise<{ items: CatalogItem[]; meta: SourceState["meta"] }> {
  const api = base(process.env.SALLA_API_URL);
  const key = process.env.SALLA_API_KEY;
  if (!api || !key) throw new Error("Salla API not configured");
  const rows: Array<Record<string, unknown>> = [];
  let meta: SourceState["meta"] = {};
  for (let page = 1, pages = 1; page <= Math.min(pages, 50); page++) {
    const url = `${api}/catalog?page=${page}&limit=200`;
    if (!allowPrivate()) await assertPublicUrl(url);
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json", Authorization: `Bearer ${key}`, "User-Agent": UA }, redirect: "error", timeoutMs: 10000 });
    if (!res.ok) throw new Error(`Salla API answered ${res.status}`);
    const j = (await res.json()) as { products?: Array<Record<string, unknown>>; pages?: number; rates?: Record<string, unknown> };
    pages = Number(j.pages) || 1;
    if (j.rates) meta = { usd_rate: num(j.rates.usd_rate) ?? undefined, pi_price_cache: num(j.rates.pi_price_cache) ?? undefined, profit_percentage: num(j.rates.profit_percentage) ?? undefined };
    const list = Array.isArray(j.products) ? j.products : [];
    rows.push(...list);
    if (!list.length) break;
  }
  const items: CatalogItem[] = [];
  for (const p of rows) {
    const id = str(p.id, 64);
    const title = str(p.title, 200);
    const egp = num(p.price_egp);
    const url = str(p.url, 300);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !title || !(egp && egp > 0) || p.in_stock === false) continue;
    if (url !== `https://mall.salla-shop.com/product/${id}`) continue; // only real Salla product links
    const pics = [p.image, ...(Array.isArray(p.images) ? p.images : [])].map(httpsImg).filter(Boolean) as string[];
    items.push({
      id: `salla:${id}`,
      source: "salla",
      title,
      title_ar: str(p.title_ar, 200),
      description: [str(p.description, 300), str(p.description_ar, 300)].filter(Boolean).join(" — ") || null,
      url,
      price_egp: egp,
      list_price_egp: (num(p.list_price_egp) ?? 0) > egp ? num(p.list_price_egp) : null,
      image: pics[0] ?? null,
      images: [...new Set(pics)].slice(0, 8),
      category: [str(p.category, 60), str(p.category_ar, 60)].filter(Boolean).join(" / ") || null,
      tags: (Array.isArray(p.tags) ? p.tags : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 10) as string[],
      in_stock: true,
      stock: num(p.stock),
      digital: false,
    });
  }
  return { items, meta };
}

/** Salla's own formula (checked against its pages): Pi = EGP ÷ usd_rate ÷ Pi price × (1 + profit %). */
export function sallaPi(egp: number, meta: SourceState["meta"]): number | null {
  const { usd_rate, pi_price_cache, profit_percentage } = meta;
  if (!(egp > 0) || !usd_rate || !pi_price_cache) return null;
  return Math.round((egp / usd_rate / pi_price_cache) * (1 + (profit_percentage ?? 0) / 100) * 1e4) / 1e4;
}

/* ------------------------------------------------------------------ */
/* 2. Storage + refresh                                                */
/* ------------------------------------------------------------------ */

const mem = { items: new Map<string, CatalogItem & { active: boolean }>(), sources: new Map<CatalogSource, SourceState & { lock_until?: number }>() };

// Without a database, the enrichment job works on the in-memory rows (tests, local runs).
attachMemoryCatalog(
  () => [...mem.items.values()] as unknown as MemCatalogRow[],
  () => {
    version++;
  },
);

const fingerprint = (it: CatalogItem) =>
  createHash("sha1")
    .update(JSON.stringify([it.title, it.title_ar, it.description, it.price, it.price_egp, it.list_price_egp, it.image, it.images, it.in_stock, it.stock, it.category, it.tags, it.country, it.ships_global, it.shipping]))
    .digest("hex")
    .slice(0, 16);

/** Take the refresh lock of a store (2 min). False when another instance holds it. */
async function claim(source: CatalogSource): Promise<boolean> {
  const until = new Date(Date.now() + 2 * 60_000).toISOString();
  if (!supabaseEnabled) {
    const s = mem.sources.get(source);
    if (s?.lock_until && s.lock_until > Date.now()) return false;
    mem.sources.set(source, { ...(s ?? { source, refreshed_at: null, items: 0, ok: null, error: null, meta: {} }), lock_until: Date.parse(until) });
    return true;
  }
  const { data, error } = await supabase()
    .from("catalog_sources")
    .update({ lock_until: until })
    .eq("source", source)
    .or(`lock_until.is.null,lock_until.lt.${new Date().toISOString()}`)
    .select("source");
  if (error) throw new Error(`catalog lock: ${error.message}`);
  return !!data?.length;
}

async function save(source: CatalogSource, items: CatalogItem[], meta: SourceState["meta"], started: number) {
  const now = new Date().toISOString();
  if (!supabaseEnabled) {
    const ids = new Set(items.map((i) => i.id));
    for (const [id, it] of mem.items) if (it.source === source && !ids.has(id)) it.active = false;
    for (const it of items) {
      const hash = fingerprint(it);
      const old = mem.items.get(it.id) as (CatalogItem & { hash?: string; enriched_hash?: string | null }) | undefined;
      const keep = old && old.hash === hash ? { brand: old.brand, model: old.model, norm_category: old.norm_category, title_en: old.title_en, keywords: old.keywords, twin_key: old.twin_key, enriched_hash: old.enriched_hash, title_ar: it.title_ar ?? old.title_ar } : {};
      mem.items.set(it.id, { ...it, ...keep, hash, active: true } as unknown as CatalogItem & { active: boolean });
    }
    mem.sources.set(source, { source, refreshed_at: now, items: items.length, ok: true, error: null, meta, lock_until: 0 });
    version++;
    return;
  }
  const db = supabase();
  for (let i = 0; i < items.length; i += 200) {
    const rows = items.slice(i, i + 200).map((it) => ({ ...it, active: true, hash: fingerprint(it), seen_at: now, updated_at: now }));
    const { error } = await db.from("catalog_items").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`catalog save: ${error.message}`);
  }
  // Gone from the store → inactive (kept for price history and old links).
  await db.from("catalog_items").update({ active: false }).eq("source", source).eq("active", true).lt("seen_at", now);
  await db
    .from("catalog_sources")
    .update({ refreshed_at: now, items: items.length, ok: true, error: null, duration_ms: Date.now() - started, meta, lock_until: null })
    .eq("source", source);
}

async function fail(source: CatalogSource, err: Error, started: number) {
  if (!supabaseEnabled) {
    const s = mem.sources.get(source);
    mem.sources.set(source, { ...(s ?? { source, refreshed_at: null, items: 0, meta: {} }), ok: false, error: err.message.slice(0, 300), lock_until: 0 });
    return;
  }
  await supabase()
    .from("catalog_sources")
    .update({ ok: false, error: err.message.slice(0, 300), duration_ms: Date.now() - started, lock_until: null })
    .eq("source", source);
}

export interface RefreshResult {
  source: CatalogSource;
  status: "fresh" | "locked" | "updated" | "failed" | "skipped";
  items?: number;
  ms?: number;
  error?: string;
}

/** Re-read the stores whose copy is stale (or all of them with force). Never throws. */
export async function refreshCatalog(opts: { force?: boolean; sources?: CatalogSource[] } = {}): Promise<RefreshResult[]> {
  const states = await sourceStates().catch(() => new Map<CatalogSource, SourceState>());
  const want = (opts.sources ?? SOURCES).filter((s) => opts.force || isStale(states.get(s), s));
  const asked = opts.sources ?? SOURCES;
  const skipped = SOURCES.filter((s) => !want.includes(s)).map((s): RefreshResult => ({ source: s, status: asked.includes(s) ? "fresh" : "skipped" }));
  let browser: BrowserSession | null = null;
  try {
    const done = await Promise.all(
      want.map(async (source): Promise<RefreshResult> => {
        const started = Date.now();
        try {
          const sallaApi = !!(process.env.SALLA_API_URL && process.env.SALLA_API_KEY);
          if (source === "salla" && !sallaApi && !browserAvailable()) return { source, status: "skipped", error: "no browser" };
          if (!(await claim(source))) return { source, status: "locked" };
          let items: CatalogItem[];
          let meta: SourceState["meta"] = {};
          if (source === "pcm") items = await fetchPcm();
          else if (source === "pkt") items = await fetchPkt();
          else if (source === "gtp") items = await fetchGtp();
          else {
            // Partner API first (fast, no browser); the public page read is the fallback.
            const viaApi = sallaApi ? await fetchSallaApi().catch(() => null) : null;
            let parsed = viaApi?.items.length ? viaApi : null;
            if (!parsed) {
              if (!browserAvailable()) throw new Error("Salla API failed and no browser");
              browser ??= new BrowserSession();
              parsed = parseSalla(await browser.sallaCatalog());
            }
            if (!parsed.meta.usd_rate || !parsed.meta.pi_price_cache) throw new Error("Salla prices settings not found");
            ({ items, meta } = parsed);
          }
          // An empty read is far more likely a broken page than an empty store: keep the old copy.
          if (!items.length) throw new Error("no products read");
          await save(source, items, meta, started);
          return { source, status: "updated", items: items.length, ms: Date.now() - started };
        } catch (e) {
          await fail(source, e as Error, started).catch(() => {});
          return { source, status: "failed", error: (e as Error).message, ms: Date.now() - started };
        }
      }),
    );
    return [...done, ...skipped];
  } finally {
    await (browser as BrowserSession | null)?.close();
  }
}

function isStale(s: SourceState | undefined, source: CatalogSource): boolean {
  if (!s?.refreshed_at) return true;
  return Date.now() - Date.parse(s.refreshed_at) > TTL_MIN[source] * 60_000;
}

/** Stores whose copy is older than its TTL (or never read). */
export async function staleSources(): Promise<CatalogSource[]> {
  const states = await sourceStates();
  return SOURCES.filter((s) => isStale(states.get(s), s));
}

async function sourceStates(): Promise<Map<CatalogSource, SourceState>> {
  if (!supabaseEnabled) return new Map([...mem.sources].map(([k, v]) => [k, v]));
  const { data, error } = await supabase().from("catalog_sources").select("source, refreshed_at, items, ok, error, meta");
  if (error) throw new Error(`catalog sources: ${error.message}`);
  return new Map(((data ?? []) as SourceState[]).map((r) => [r.source, r]));
}

/* ------------------------------------------------------------------ */
/* 3. Search                                                           */
/* ------------------------------------------------------------------ */

/** Lowercase, Arabic letter variants unified, diacritics/tatweel removed, punctuation → space. */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
/** "السماعة" → "سماعه"; "headphones" → "headphone" (light stemming, both sides). */
function stem(w: string): string {
  if (/^ال[؀-ۿ]{3,}/.test(w)) w = w.slice(2);
  if (/^[a-z]{4,}s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
  return w;
}
const STOP = new Set(
  "the a an and or for with of to in on at by from new best cheap buy price pi shop store near me في من على عن الى إلى مع او أو و ال اللي عايز عاوز عايزه محتاج ابغى ابي اريد سعر بكام ارخص رخيص افضل احسن جديد شراء اشتري متجر محل قريب باي".split(" ").map((w) => stem(normText(w))),
);
const words = (s: string) => normText(s).split(" ").map(stem).filter((w) => w.length >= 2 && !STOP.has(w));

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Single-word synonyms across languages: "دراجه" ↔ "bike" ↔ "bicycle" ↔ "عجله". */
let synonyms: Map<string, string[]> | null = null;
function synonymsOf(w: string): string[] {
  if (!synonyms) {
    const m = new Map<string, Set<string>>();
    for (const g of synonymGroups()) {
      const singles = g.map((x) => words(x)).filter((ws) => ws.length === 1).map((ws) => ws[0]);
      for (const a of singles) {
        const set = m.get(a) ?? new Set<string>();
        for (const b of singles) if (b !== a) set.add(b);
        m.set(a, set);
      }
    }
    synonyms = new Map([...m].map(([k, v]) => [k, [...v]]));
  }
  return synonyms.get(w) ?? [];
}

interface Indexed {
  item: CatalogItem;
  title: string[];
  body: Set<string>;
}

let version = 0;
let loaded: { at: number; checkedAt: number; key: string; rows: Indexed[]; states: Map<CatalogSource, SourceState>; twins: Map<string, Indexed[]> } | null = null;

/** The in-memory index; reloaded only when a store was refreshed (checked at most once a minute). */
async function index(): Promise<NonNullable<typeof loaded>> {
  const now = Date.now();
  if (loaded && now - loaded.checkedAt < 60_000 && (supabaseEnabled || loaded.key === `mem${version}`)) return loaded;
  const states = await sourceStates();
  // Reload when a store was re-read or products were enriched.
  const key = supabaseEnabled ? SOURCES.map((s) => `${states.get(s)?.refreshed_at ?? "-"}/${states.get(s)?.meta?.enriched_at ?? "-"}`).join("|") : `mem${version}`;
  if (loaded && loaded.key === key) {
    loaded.checkedAt = now;
    loaded.states = states;
    return loaded;
  }
  let items: CatalogItem[];
  if (!supabaseEnabled) items = [...mem.items.values()].filter((i) => i.active);
  else {
    const { data, error } = await supabase()
      .from("catalog_items")
      .select("id, source, title, title_ar, description, price, price_egp, list_price_egp, url, image, images, seller, country, category, tags, in_stock, stock, digital, ships_global, shipping, brand, model, norm_category, title_en, keywords, twin_key")
      .eq("active", true)
      .limit(20000);
    if (error) throw new Error(`catalog load: ${error.message}`);
    items = (data ?? []) as CatalogItem[];
  }
  // Smart indexing with plain rules (rules.ts): category + brand/model twin key, in memory, no AI.
  for (const it of items) {
    it.norm_category ??= ruleCategory(it);
    it.twin_key ??= ruleTwinKey(it);
  }
  const rows = items.map((item) => ({
    item,
    title: words(`${item.title} ${item.title_ar ?? ""} ${item.title_en ?? ""} ${item.brand ?? ""} ${item.model ?? ""}`),
    body: new Set(words(`${item.category ?? ""} ${(item.tags ?? []).join(" ")} ${(item.keywords ?? []).join(" ")} ${item.seller ?? ""} ${item.description ?? ""}`)),
  }));
  const twins = new Map<string, Indexed[]>();
  for (const r of rows) if (r.item.twin_key) twins.set(r.item.twin_key, [...(twins.get(r.item.twin_key) ?? []), r]);
  loaded = { at: now, checkedAt: now, key, rows, states, twins };
  return loaded;
}

/**
 * How well one query word matches an item: exact title word > prefix > typo > description.
 * Prefixes need 4+ letters ("head" must not match "headphones" → no shampoo), and typos keep
 * the first letter ("honey" ≠ "money"); a swap of two letters is one typo ("oriamo" → "oraimo").
 */
function wordScore(w: string, row: Indexed): number {
  let best = 0;
  const maxTypos = w.length >= 8 ? 2 : 1;
  for (const t of row.title) {
    if (t === w) return 3;
    if (w.length >= 4 && (t.startsWith(w) || (t.length >= Math.max(4, w.length - 2) && w.startsWith(t)))) best = Math.max(best, 2.2);
    else if (w.length >= 5 && best < 1.6 && t[0] === w[0] && editDistance(w, t, maxTypos) <= maxTypos) best = Math.max(best, 1.6);
  }
  if (best < 1 && row.body.has(w)) best = 1;
  if (best < 0.8 && w.length >= 5) for (const b of row.body) if (b.startsWith(w)) return 0.8;
  return best;
}

/** Regions Salla Shop Mall ships to (Egypt, the Middle East, Africa). */
const SALLA_REGION = new Set(
  "EG SA AE KW QA BH OM YE JO LB SY IQ PS IL TR IR LY TN DZ MA MR SD SS ER DJ SO ET KE UG TZ RW BI CD CG CM NG GH CI SN ML NE TD BF GN GW SL LR TG BJ GA GQ CF AO ZM ZW MW MZ NA BW ZA LS SZ MG MU SC KM CV ST".split(" "),
);
function reaches(it: CatalogItem, country: string): boolean {
  if (it.source === "salla") return SALLA_REGION.has(country);
  if (it.source === "gtp") return it.digital || !it.country || it.country === country;
  // Piketplace: the countries it ships to (none listed = seller's country only).
  // Sellers there often tick "digital" on physical goods (shoes…), so that flag doesn't widen the reach.
  if (it.source === "pkt") return it.shipping && Object.keys(it.shipping).length ? country in it.shipping : it.country === country;
  // Pi Chain Mall: global-sale listings everywhere; local ones only in their sales country.
  return !!it.ships_global || it.country === country;
}

/** Categories of a store's products (for the store page chips), most common first. */
export async function catalogCategories(country: string, source?: CatalogSource): Promise<string[]> {
  const idx = await index();
  const n = new Map<string, number>();
  for (const r of idx.rows) {
    if ((source && r.item.source !== source) || !reaches(r.item, country) || !r.item.category) continue;
    n.set(r.item.category, (n.get(r.item.category) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 14);
}

/** Per store: products reachable in a country + how fresh the copy is (for the stores directory). */
export async function catalogStats(country: string): Promise<Array<{ source: CatalogSource; name: string; products: number; total: number; ageMin: number | null; ok: boolean | null }>> {
  const idx = await index();
  return SOURCES.map((s) => {
    const st = idx.states.get(s);
    const rows = idx.rows.filter((r) => r.item.source === s);
    return {
      source: s,
      name: STORE_NAME[s],
      products: rows.filter((r) => reaches(r.item, country)).length,
      total: rows.length,
      ageMin: st?.refreshed_at ? Math.round((Date.now() - Date.parse(st.refreshed_at)) / 60_000) : null,
      ok: st?.ok ?? null,
    };
  });
}

export interface IndexHit {
  item: CatalogItem;
  score: number;
  /** Pi price now (Salla: computed with its current rate). */
  price: number;
  listPrice?: number;
  store: string;
  /** Minutes since this store's copy was read. */
  ageMin: number;
}

/** Search the index. Several phrasings (e.g. the AR↔EN expansion) count; the best one wins per item. */
export async function searchCatalog(
  queries: string[],
  opts: {
    country: string;
    limit?: number;
    /** Only these stores. */
    sources?: CatalogSource[];
    /** Category text (matches the store's category, either language). */
    category?: string;
    /** No query → list everything that matches the filters (newest first) instead of nothing. */
    browse?: boolean;
    /** AI-normalized categories (enrich.ts); a product in one of them matches even without the words. */
    cats?: string[];
  },
): Promise<{ hits: IndexHit[]; sources: Record<string, { items: number; ageMin: number | null; ok: boolean | null }> }> {
  const idx = await index();
  const phrases = [...new Set(queries.flatMap((q) => expandQuery(q)).map((q) => words(q).join(" ")).filter(Boolean))].map((p) => p.split(" "));
  const hits: IndexHit[] = [];
  const ages = new Map<CatalogSource, number>();
  for (const s of SOURCES) {
    const at = idx.states.get(s)?.refreshed_at;
    ages.set(s, at ? Math.round((Date.now() - Date.parse(at)) / 60_000) : -1);
  }
  const cat = opts.category ? normText(opts.category) : "";
  if (phrases.length || opts.browse || opts.cats?.length) {
    for (const row of idx.rows) {
      const it = row.item;
      if (!reaches(it, opts.country)) continue;
      if (opts.sources && !opts.sources.includes(it.source)) continue;
      if (cat && !normText(it.category ?? "").includes(cat)) continue;
      const inCat = !!opts.cats?.length && !!it.norm_category && opts.cats.includes(it.norm_category);
      if (opts.cats?.length && !phrases.length && !inCat) continue;
      let best = phrases.length ? (inCat ? 0.9 : 0) : 1;
      for (const ws of phrases) {
        // A word counts through any of its synonyms (a synonym is a bit weaker than the word itself).
        const scores = ws.map((w) => Math.max(wordScore(w, row), ...synonymsOf(w).map((s) => wordScore(s, row) * 0.95)));
        const matched = scores.filter((x) => x > 0).length;
        // Every word should match when there are 1-2 words; most of them for longer queries.
        if (matched < (ws.length <= 2 ? ws.length : Math.ceil(ws.length * 0.6))) continue;
        best = Math.max(best, scores.reduce((a, b) => a + b, 0) / (3 * ws.length));
      }
      if (!best) continue;
      let price: number | null = it.price ?? null;
      let listPrice: number | undefined;
      if (it.source === "salla") {
        const meta = idx.states.get("salla")?.meta ?? {};
        price = sallaPi(Number(it.price_egp), meta);
        listPrice = it.list_price_egp ? (sallaPi(Number(it.list_price_egp), meta) ?? undefined) : undefined;
      }
      if (!price || !(price > 0)) continue;
      const boost = (it.in_stock ? 0.05 : -0.2) + (it.image ? 0.03 : 0) + (it.source === "pcm" ? 0.04 : 0);
      hits.push({ item: it, score: Math.round((best + boost) * 1000) / 1000, price: Number(price), listPrice, store: STORE_NAME[it.source], ageMin: ages.get(it.source) ?? -1 });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  // With a strong match on top, very weak ones are noise ("iphone" → not the iTunes card).
  const cut = phrases.length ? (hits[0]?.score ?? 0) * 0.5 : 0;
  while (hits.length && hits[hits.length - 1].score < cut) hits.pop();
  const sources: Record<string, { items: number; ageMin: number | null; ok: boolean | null }> = {};
  for (const s of SOURCES) {
    const st = idx.states.get(s);
    sources[STORE_NAME[s]] = { items: idx.rows.filter((r) => r.item.source === s).length, ageMin: (ages.get(s) ?? -1) >= 0 ? ages.get(s)! : null, ok: st?.ok ?? null };
  }
  return { hits: hits.slice(0, opts.limit ?? 12), sources };
}

/** Current Pi price of an indexed product page (for watches), or undefined when unknown/stale. */
export async function indexedPrice(url: string): Promise<number | undefined> {
  const idx = await index();
  const row = idx.rows.find((r) => r.item.url === url);
  if (!row) return;
  const st = idx.states.get(row.item.source);
  if (!st?.refreshed_at || Date.now() - Date.parse(st.refreshed_at) > 2 * TTL_MIN[row.item.source] * 60_000) return;
  return row.item.source === "salla" ? (sallaPi(Number(row.item.price_egp), st.meta ?? {}) ?? undefined) : (row.item.price ?? undefined);
}

/** The same product (brand + model) in OTHER stores that reach the country, cheapest first. */
export async function twinsOf(itemId: string, country: string): Promise<IndexHit[]> {
  const idx = await index();
  const me = idx.rows.find((r) => r.item.id === itemId)?.item;
  if (!me?.twin_key) return [];
  const out: IndexHit[] = [];
  for (const r of idx.twins.get(me.twin_key) ?? []) {
    const it = r.item;
    if (it.id === me.id || it.source === me.source || !reaches(it, country)) continue;
    const price = it.source === "salla" ? sallaPi(Number(it.price_egp), idx.states.get("salla")?.meta ?? {}) : (it.price ?? null);
    if (!price) continue;
    const ship = it.shipping && country in it.shipping ? it.shipping[country] : 0;
    out.push({ item: it, score: 1, price: Math.round((price + (ship || 0)) * 100) / 100, store: STORE_NAME[it.source], ageMin: -1 });
  }
  return out.sort((a, b) => a.price - b.price).slice(0, 4);
}

/** One indexed product by id (product page). */
export async function catalogItem(id: string, country: string): Promise<IndexHit | null> {
  const idx = await index();
  const it = idx.rows.find((r) => r.item.id === id)?.item;
  if (!it || !reaches(it, country)) return null;
  const meta = idx.states.get("salla")?.meta ?? {};
  const price = it.source === "salla" ? sallaPi(Number(it.price_egp), meta) : (it.price ?? null);
  if (!price) return null;
  const listPrice = it.source === "salla" && it.list_price_egp ? (sallaPi(Number(it.list_price_egp), meta) ?? undefined) : undefined;
  const at = idx.states.get(it.source)?.refreshed_at;
  return { item: it, score: 1, price, listPrice, store: STORE_NAME[it.source], ageMin: at ? Math.round((Date.now() - Date.parse(at)) / 60_000) : -1 };
}

/** Tests: forget the in-memory copy. */
export function resetCatalogMemory() {
  mem.items.clear();
  mem.sources.clear();
  loaded = null;
  version++;
}
