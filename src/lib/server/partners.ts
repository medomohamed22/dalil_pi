import "server-only";
import { assertPublicUrl, fetchWithTimeout } from "./net";

/**
 * Partner data APIs — fast, exact store/product data instead of browsing.
 * Each one is OFF until its owner grants access and the keys are set in Vercel:
 *
 *  Map of Pi (local Pi shops)           MAPOFPI_API_URL, MAPOFPI_API_KEY (optional), MAPOFPI_APP_URL (optional)
 *    Uses the endpoints of Map of Pi's open-source app (github.com/map-of-pi):
 *      POST {api}/sellers/fetch          { bounds: { sw_lat, sw_lng, ne_lat, ne_lng }, search_query? }
 *      GET  {api}/sellers/{seller_id}    seller details (address, rating, description)
 *      GET  {api}/sellers/item/{id}      the seller's items with Pi prices and stock
 *
 *  Salla Shop (Pi marketplace)          SALLA_API_URL, SALLA_API_KEY
 *    "Dalil Pi Partner API v1" (docs/PARTNER_APIS.md):
 *      GET  {api}/products?q=&country=&limit=   → { products: PartnerProduct[] }
 *
 * See docs/PARTNER_APIS.md for the full contract and the access requests.
 */

/** Tests only: allow mock partner servers on localhost. Never on Vercel. */
const allowPrivate = () => !process.env.VERCEL && process.env.DALIL_TEST_ALLOW_PRIVATE_STORES === "1";

async function getJson<T>(url: string, init: { method?: string; body?: unknown; key?: string; timeoutMs?: number } = {}): Promise<T> {
  if (!allowPrivate()) await assertPublicUrl(url);
  const res = await fetchWithTimeout(url, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.key ? { Authorization: `Bearer ${init.key}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "error",
    timeoutMs: init.timeoutMs ?? 6000,
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

const base = (v?: string) => (v ? v.replace(/\/+$/, "") : "");
const dec = (x: unknown): number => {
  const n = typeof x === "object" && x ? Number((x as { $numberDecimal?: string }).$numberDecimal) : Number(x);
  return Number.isFinite(n) ? n : NaN;
};

/* ======================= Map of Pi ======================= */

export function mapOfPiConfigured(): boolean {
  return !!process.env.MAPOFPI_API_URL;
}

interface MopSeller {
  seller_id: string;
  name: string;
  image?: string;
  seller_type?: string;
  isRestricted?: boolean;
  address?: string;
  description?: string;
  average_rating?: { $numberDecimal: string } | number;
  sell_map_center?: { type: "Point"; coordinates: [number, number] };
  coordinates?: [number, number];
  trust_meter_rating?: number;
  order_online_enabled_pref?: boolean;
  fulfillment_method?: string;
}
interface MopItem {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  stock_level?: string;
  price: { $numberDecimal: string } | string | number;
}

export interface LocalShop {
  sellerId: string;
  store: string;
  url: string;
  image?: string;
  address?: string;
  description?: string;
  lat: number;
  lon: number;
  distanceKm: number;
  rating?: number;
  /** Map of Pi's community trust meter (0, 50, 80 or 100). */
  trustMeter?: number;
  onlineOrders?: boolean;
  delivery?: string;
  items: { title: string; price: number; currency: "PI"; image?: string; stock?: string }[];
}

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Pi shops around a point (radius in km), nearest first, with their matching
 * items and Pi prices. Test, restricted and inactive sellers are skipped.
 */
export async function mapOfPiNearby(opts: { lat: number; lon: number; radiusKm?: number; query?: string; limit?: number }): Promise<LocalShop[]> {
  const api = base(process.env.MAPOFPI_API_URL);
  if (!api) throw new Error("Map of Pi API not configured");
  const key = process.env.MAPOFPI_API_KEY || undefined;
  const app = base(process.env.MAPOFPI_APP_URL) || "https://mapofpi7689.pinet.com";
  const r = Math.min(50, Math.max(1, opts.radiusKm ?? 10));
  const dLat = r / 111;
  const dLon = r / (111 * Math.max(0.2, Math.cos((opts.lat * Math.PI) / 180)));
  const bounds = { sw_lat: opts.lat - dLat, sw_lng: opts.lon - dLon, ne_lat: opts.lat + dLat, ne_lng: opts.lon + dLon };
  const q = opts.query?.trim().slice(0, 80);
  const raw = await getJson<MopSeller[] | { sellers?: MopSeller[] }>(`${api}/sellers/fetch`, { method: "POST", key, body: { bounds, ...(q ? { search_query: q } : {}) } });
  const sellers = (Array.isArray(raw) ? raw : raw?.sellers ?? []).filter(
    (s) => s?.seller_id && s.name && !s.isRestricted && !["testSeller", "inactiveSeller"].includes(s.seller_type ?? ""),
  );
  const here = { lat: opts.lat, lon: opts.lon };
  const located = sellers
    .map((s) => {
      const c = s.sell_map_center?.coordinates ?? s.coordinates; // GeoJSON order: [lng, lat]
      if (!c || c.length !== 2) return null;
      const pos = { lat: Number(c[1]), lon: Number(c[0]) };
      return Number.isFinite(pos.lat) && Number.isFinite(pos.lon) ? { s, pos, d: km(here, pos) } : null;
    })
    .filter((x): x is { s: MopSeller; pos: { lat: number; lon: number }; d: number } => !!x)
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(8, opts.limit ?? 6));

  const words = (q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  return Promise.all(
    located.map(async ({ s, pos, d }) => {
      const [detail, items] = await Promise.all([
        getJson<MopSeller>(`${api}/sellers/${encodeURIComponent(s.seller_id)}`, { key, timeoutMs: 4000 }).catch(() => null),
        getJson<MopItem[]>(`${api}/sellers/item/${encodeURIComponent(s.seller_id)}`, { key, timeoutMs: 4000 }).catch(() => [] as MopItem[]),
      ]);
      const all = (Array.isArray(items) ? items : [])
        .map((it) => ({ title: String(it.name ?? "").slice(0, 140), price: dec(it.price), currency: "PI" as const, image: it.image || undefined, stock: it.stock_level }))
        .filter((it) => it.title && it.price > 0 && it.stock !== "Sold");
      const matching = words.length ? all.filter((it) => words.some((w) => it.title.toLowerCase().includes(w))) : all;
      const rating = dec(detail?.average_rating ?? s.average_rating);
      return {
        sellerId: s.seller_id,
        store: s.name.slice(0, 100),
        url: `${app}/en/seller/sale-items/${encodeURIComponent(s.seller_id)}`,
        image: detail?.image || s.image || undefined,
        address: (detail?.address ?? s.address)?.slice(0, 160) || undefined,
        description: (detail?.description ?? s.description)?.slice(0, 200) || undefined,
        lat: pos.lat,
        lon: pos.lon,
        distanceKm: Math.round(d * 10) / 10,
        rating: rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : undefined,
        trustMeter: typeof s.trust_meter_rating === "number" ? s.trust_meter_rating : undefined,
        onlineOrders: detail?.order_online_enabled_pref ?? s.order_online_enabled_pref,
        delivery: detail?.fulfillment_method ?? s.fulfillment_method,
        items: (matching.length ? matching : all).slice(0, 5),
      } satisfies LocalShop;
    }),
  );
}

/* ======================= Salla Shop (Partner API v1) ======================= */

export function sallaApiConfigured(): boolean {
  return !!process.env.SALLA_API_URL && !!process.env.SALLA_API_KEY;
}

export interface PartnerProduct {
  id: string;
  title: string;
  url: string;
  image?: string;
  price: number;
  currency: string;
  in_stock?: boolean;
  rating?: number;
  review_count?: number;
  ships_to?: string[];
  store?: { id?: string; name?: string; rating?: number; review_count?: number; verified?: boolean };
}

/** Product search on Salla Shop through its partner API (exact prices, links, images, stock). */
export async function sallaApiSearch(q: string, opts: { country?: string; limit?: number } = {}): Promise<PartnerProduct[]> {
  const api = base(process.env.SALLA_API_URL);
  if (!api || !process.env.SALLA_API_KEY) throw new Error("Salla API not configured");
  const params = new URLSearchParams({ q: q.slice(0, 80), limit: String(Math.min(24, opts.limit ?? 12)) });
  if (opts.country) params.set("country", opts.country);
  const j = await getJson<{ products?: PartnerProduct[] }>(`${api}/products?${params}`, { key: process.env.SALLA_API_KEY, timeoutMs: 5000 });
  return (j?.products ?? [])
    .filter((p) => p && p.title && p.url && Number(p.price) > 0)
    .map((p) => ({ ...p, price: Number(p.price), currency: String(p.currency || "PI").toUpperCase() }))
    .filter((p) => {
      try {
        return ["https:", ...(allowPrivate() ? ["http:"] : [])].includes(new URL(p.url).protocol);
      } catch {
        return false;
      }
    });
}

/* ======================= Pi Chain Mall (pipcm.com) ======================= */

/**
 * Pi Chain Mall — Pi Network's global barter marketplace (Pi Hackathon 2021 winner).
 * Reads the same public product search its own search page uses for visitors (no key,
 * no login). Product pages: https://pipcm.com/#/product/new-detail?id=…&userId=…
 * (the buyer signs in with Pi there to order). PCM_SEARCH=off turns it off.
 */
export const PCM_SITE = "https://pipcm.com";
const PCM_API = () => base(process.env.PCM_API_URL) || "https://api.pipcm.com";
const PCM_IMG = "https://image.pcmsuper.art/image/";

/**
 * Pi Chain Mall lists every product under ONE sales country (its own numeric ids), and marks
 * "global sale" products (commdityMark = 1) that ship to every country. Others ("Whether global
 * barter: no") are only sold in that country. The id list is login-only, so these were matched
 * from the products themselves on 2026-11-08 (e.g. 235: an Indian seller's "Ship From: India";
 * 17: an Egyptian-pound phone top-up). Unknown ids → the listing is shown nowhere unless global.
 */
export const PCM_COUNTRY_IDS: Record<string, string> = { "17": "EG", "235": "IN", "7": "CN", "170": "JP" };
export const pcmIdOf = (iso: string) => Object.entries(PCM_COUNTRY_IDS).find(([, c]) => c === iso)?.[0];

export function pcmEnabled(): boolean {
  return process.env.PCM_SEARCH !== "off";
}

interface PcmCommodity {
  id: string;
  userId?: string;
  title?: string;
  price?: number;
  status?: number;
  urlList?: string[];
  pictureUrl?: string;
  tUserEntity?: { nickName?: string; userName?: string };
  commdityMark?: number | null;
}

export interface PcmItem {
  id: string;
  /** Ships to every country ("global sale"). */
  global: boolean;
  /** Sales country (ISO) when it is a local listing we can place. */
  country?: string;
  title: string;
  /** Price in Pi (the site shows it as "… π"). */
  price: number;
  currency: "PI";
  url: string;
  image?: string;
  seller?: string;
}

/** Its search matches case-sensitively, so try the usual spellings of each keyword. */
export function pcmVariants(q: string): string[] {
  const t = q.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!t) return [];
  const title = t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, s: string, c: string) => s + c.toUpperCase());
  return Array.from(new Set([t, title, t.toUpperCase(), t.toLowerCase()]));
}

/**
 * Search Pi Chain Mall for what can reach `country`: its global-sale listings plus the local
 * listings of that country. Without a country (e.g. watch checks) every listing is searched.
 */
export async function pcmSearch(q: string, limit = 12, country?: string): Promise<PcmItem[]> {
  const local = country ? pcmIdOf(country) : undefined;
  // [countryId, commdityMark]: global listings anywhere + local listings of the user's country.
  const scopes: Array<[string, string, string | undefined]> = country
    ? [["globle8787", "1", undefined], ...(local ? ([[local, "-1", country]] as Array<[string, string, string]>) : [])]
    : [["globle8787", "-1", undefined]];
  const lists = await Promise.all(
    pcmVariants(q).flatMap((v) =>
      scopes.map(async ([countryId, mark, iso]) => {
        const u = new URL(`${PCM_API()}/api/commodity/commodity/getCommodityList`);
        for (const [k, val] of Object.entries({ currentPage: "1", pageSize: "20", countryId, hasStock: "false", commdityMark: mark, search: v })) u.searchParams.set(k, val);
        try {
          const j = await getJson<{ code?: string; object?: PcmCommodity[] }>(u.toString(), { timeoutMs: 5000 });
          return (Array.isArray(j.object) ? j.object : []).map((c) => ({ c, iso }));
        } catch {
          return [];
        }
      }),
    ),
  );
  const seen = new Set<string>();
  const out: PcmItem[] = [];
  for (const { c, iso } of lists.flat()) {
    const price = Number(c.price);
    if (!c?.id || seen.has(c.id) || !c.title || !(price > 0) || (c.status ?? 0) !== 0) continue;
    seen.add(c.id);
    const pic = c.pictureUrl || c.urlList?.[0]?.trim();
    const global = c.commdityMark === 1;
    // Searching for a country: a non-global listing only counts when it came from that country's list.
    if (country && !global && iso !== country) continue;
    out.push({
      id: c.id,
      global,
      country: global ? undefined : iso,
      title: c.title.trim().slice(0, 160),
      price,
      currency: "PI",
      url: `${PCM_SITE}/#/product/new-detail?id=${encodeURIComponent(c.id)}${c.userId ? `&userId=${encodeURIComponent(c.userId)}` : ""}`,
      image: pic ? (/^https?:\/\//.test(pic) ? pic : PCM_IMG + pic.replace(/^\/+/, "")) : undefined,
      seller: c.tUserEntity?.nickName || c.tUserEntity?.userName || undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Current Pi price of a Pi Chain Mall listing (found again by its title, matched by id). */
export async function pcmPriceOf(url: string, title: string): Promise<number | undefined> {
  let id = "";
  try {
    id = new URL(new URL(url).hash.slice(1), "http://h").searchParams.get("id") ?? "";
  } catch {
    return;
  }
  const words = title.trim().split(/\s+/);
  if (!id || !words[0]) return;
  for (const q of [words.slice(0, 4).join(" "), words.slice(0, 2).join(" "), words[0]]) {
    const hit = (await pcmSearch(q, 40)).find((x) => x.id === id);
    if (hit) return hit.price;
  }
}

/* ======================= Smaller Pi marketplaces (public searches) ======================= */

/**
 * Global Trade Pi (globaltradepi.xyz) — small global Pi marketplace (Pi SDK login, prices in π).
 * Reads the public product search its own home page uses (no key). Products carry the seller's
 * country; physical items are only useful in that country, digital ones anywhere.
 * MARKETPLACES_SEARCH=off turns these off.
 */
const GTP = () => base(process.env.GTP_API_URL) || "https://globaltradepi.xyz";

export function marketplacesEnabled(): boolean {
  return process.env.MARKETPLACES_SEARCH !== "off";
}

let countryIndex: Map<string, string> | null = null;
/** Retired, reserved and non-country region codes (BU → MM, UK → GB, EU …). */
const NOT_COUNTRY = /^(AA|AN|BU|CS|DD|DY|EU|EZ|FX|HV|NH|NT|QM|QN|QO|QP|QQ|QR|QS|QT|QU|QV|QW|QX|QY|QZ|RH|SU|TP|UK|UN|VD|X[A-Z]|YD|YU|ZR|ZZ)$/;
/** "United States of America" / "Myanmar (formerly Burma)" → "US" / "MM". */
export function countryCode(name?: string): string | undefined {
  if (!name) return;
  const key = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");
  if (!countryIndex) {
    countryIndex = new Map();
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = dn.of(code);
        if (n && n !== code && !NOT_COUNTRY.test(code)) countryIndex.set(key(n), code);
      }
    for (const [n, c] of Object.entries({ unitedstatesofamerica: "US", usa: "US", uk: "GB", burma: "MM", ivorycoast: "CI", turkey: "TR", czechrepublic: "CZ", southkorea: "KR", russia: "RU", vietnam: "VN", laos: "LA" })) countryIndex.set(n, c);
  }
  return countryIndex.get(key(name)) ?? (/^[A-Z]{2}$/.test(name) ? name : undefined);
}

export interface MarketItem {
  market: string;
  title: string;
  price: number;
  currency: "PI";
  url: string;
  image?: string;
  seller?: string;
  country?: string;
  digital: boolean;
  inStock: boolean;
}

interface GtpProduct {
  _id?: string;
  id?: string;
  title?: string;
  description?: string;
  price?: number;
  country?: string;
  images?: string[];
  stock?: number;
  status?: string;
  productType?: string;
  sellerUsername?: string;
  sellingType?: string;
}

export async function globalTradeSearch(q: string): Promise<MarketItem[]> {
  const u = new URL(`${GTP()}/api/products`);
  u.searchParams.set("page", "1");
  u.searchParams.set("limit", "30");
  u.searchParams.set("search", q.trim().slice(0, 60));
  const j = await getJson<{ products?: GtpProduct[] }>(u.toString(), { timeoutMs: 6000 });
  const out: MarketItem[] = [];
  for (const p of j.products ?? []) {
    const id = p._id ?? p.id;
    const price = Number(p.price);
    if (!id || !/^[a-f0-9]{24}$/i.test(id) || !p.title?.trim() || !(price > 0) || (p.status && p.status !== "active") || p.sellingType === "auction") continue;
    const img = p.images?.find((x) => typeof x === "string" && /^https:\/\//.test(x));
    out.push({
      market: "Global Trade Pi",
      title: p.title.trim().slice(0, 160),
      price,
      currency: "PI",
      url: `https://globaltradepi.xyz/products/${id}`,
      image: img,
      seller: p.sellerUsername,
      country: countryCode(p.country),
      digital: p.productType === "digital",
      inStock: p.stock == null || p.stock > 0,
    });
  }
  return out;
}

/** All smaller marketplaces at once; only what can reach the user (their country, or digital). */
export async function marketplacesSearch(q: string, country: string): Promise<MarketItem[]> {
  const lists = await Promise.allSettled([globalTradeSearch(q)]);
  return lists
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((x) => x.digital || !x.country || x.country === country);
}
