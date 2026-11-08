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
