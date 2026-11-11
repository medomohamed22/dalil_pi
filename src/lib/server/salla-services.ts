import "server-only";
import { cleanImg, cleanNum, cleanStr, normText, sallaApiReady, sallaError, sallaGet } from "./catalog";
import { hiddenSources } from "./settings";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Salla apps directory (partner API `GET /services`, docs/salla-partner/partner-catalog.md):
 * restaurants, services, Salla Care, Salla Go cities, mall services and Telegram products.
 * Read-only, signed like the catalog, pulled at most hourly with ETag/304, all pages of one
 * pull share one `version`. Ordering, booking and paying happen in the Salla app (`url`).
 *
 * Stored in `partner_services`; the pull state and the refresh lock are the `salla_services`
 * row of `catalog_sources`.
 */

export const SERVICE_TYPES = ["restaurant", "service", "health", "delivery", "mall_service", "telegram"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface SallaService {
  /** `<type>:<id>` (an id is unique only within its type). */
  key: string;
  type: ServiceType;
  name: string;
  name_ar: string | null;
  image: string | null;
  /** Where it works; empty = every country. */
  countries: string[];
  city: string | null;
  category: string | null;
  specialty: string | null;
  provider: string | null;
  /** Pi, only when there is one clear price. */
  price: number | null;
  price_unit: string | null;
  rating: number | null;
  ratings: number | null;
  /** Opens it in the Salla app (carries `?ref=dalilpi`, kept as sent). */
  url: string;
}

const STATE = "salla_services";
const TTL_MIN = 60;
/** Bump when the mapping changes: the next pull skips the ETag. */
const MAP = 1;

/** Links must open a Salla app page over https (salla-shop.com or a subdomain). */
function sallaLink(v: unknown): string | null {
  const s = cleanStr(v, 400);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (u.hostname !== "salla-shop.com" && !u.hostname.endsWith(".salla-shop.com")) return null;
    return s;
  } catch {
    return null;
  }
}

/** One directory entry → our row, or null when unusable. */
export function serviceRow(p: Record<string, unknown>): SallaService | null {
  const type = String(p.type ?? "") as ServiceType;
  if (!SERVICE_TYPES.includes(type)) return null;
  const id = cleanStr(p.id, 64);
  const name = cleanStr(p.name, 120) ?? cleanStr(p.name_ar, 120);
  const url = sallaLink(p.url);
  if (!id || !/^[\w-]{1,64}$/.test(id) || !name || !url) return null;
  if (String(p.currency ?? "PI").toUpperCase() !== "PI") return null;
  const countries = (Array.isArray(p.countries) ? p.countries : [])
    .map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""))
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 250);
  const price = cleanNum(p.price);
  const rating = cleanNum(p.rating);
  const ratings = cleanNum(p.ratings);
  return {
    key: `${type}:${id}`,
    type,
    name,
    name_ar: cleanStr(p.name_ar, 120),
    image: cleanImg(p.image),
    countries: [...new Set(countries)],
    city: cleanStr(p.city, 80),
    category: cleanStr(p.category, 60),
    specialty: cleanStr(p.specialty, 80),
    provider: cleanStr(p.provider, 80),
    price: price != null && price > 0 ? Math.round(price * 1e4) / 1e4 : null,
    price_unit: price != null && price > 0 ? cleanStr(p.price_unit, 30) : null,
    rating: rating != null && rating >= 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    ratings: ratings != null && ratings >= 0 ? Math.floor(ratings) : null,
    url,
  };
}

type Pull = { notModified: true } | { notModified?: false; rows: SallaService[]; etag?: string; version?: string };

/** Every page of the directory (all types in one pull). */
async function pull(etag?: string): Promise<Pull> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows: SallaService[] = [];
    let version: unknown;
    let firstEtag: string | undefined;
    let restart = false;
    for (let page = 1, pages = 1; page <= Math.min(pages, 25); page++) {
      const res = await sallaGet(`/services?page=${page}&limit=200`, page === 1 ? etag : undefined);
      if (res.status === 304 && page === 1) return { notModified: true };
      if (res.status === 429) throw new Error(`Salla API: too many requests (retry after ${res.headers.get("retry-after") ?? "?"} s)`);
      if (!res.ok) throw new Error(sallaError(res.status, "/services", (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120)));
      if (page === 1) firstEtag = res.headers.get("etag") ?? undefined;
      const j = (await res.json()) as { services?: Array<Record<string, unknown>>; pages?: number; version?: unknown };
      if (page === 1) version = j.version;
      else if (j.version !== version) {
        restart = true;
        break;
      }
      pages = Math.max(1, Math.floor(Number(j.pages) || 1));
      const list = Array.isArray(j.services) ? j.services : [];
      for (const p of list) {
        const r = serviceRow(p);
        if (r) rows.push(r);
      }
      if (!list.length) break;
    }
    if (restart) continue;
    const seen = new Set<string>();
    return { rows: rows.filter((r) => !seen.has(r.key) && seen.add(r.key)), etag: firstEtag, version: version == null ? undefined : String(version).slice(0, 80) };
  }
  throw new Error("Salla services directory kept changing during the pull");
}

/* ---------------- storage ---------------- */

interface State {
  refreshed_at: string | null;
  items: number;
  ok: boolean | null;
  error: string | null;
  meta: { etag?: string; version?: string; map?: number };
  lock_until?: number;
}
const mem: { rows: SallaService[]; state: State } = { rows: [], state: { refreshed_at: null, items: 0, ok: null, error: null, meta: {} } };

async function readState(): Promise<State | null> {
  if (!supabaseEnabled) return mem.state;
  const { data, error } = await supabase().from("catalog_sources").select("refreshed_at, items, ok, error, meta").eq("source", STATE).maybeSingle();
  if (error) throw new Error(`services state: ${error.message}`);
  return (data as State | null) ?? null;
}

async function claim(): Promise<boolean> {
  const until = new Date(Date.now() + 2 * 60_000).toISOString();
  if (!supabaseEnabled) {
    if (mem.state.lock_until && mem.state.lock_until > Date.now()) return false;
    mem.state.lock_until = Date.parse(until);
    return true;
  }
  const { data, error } = await supabase()
    .from("catalog_sources")
    .update({ lock_until: until })
    .eq("source", STATE)
    .or(`lock_until.is.null,lock_until.lt.${new Date().toISOString()}`)
    .select("source");
  if (error) throw new Error(`services lock: ${error.message}`);
  return !!data?.length;
}

async function finish(patch: Partial<State> & { duration_ms: number }) {
  if (!supabaseEnabled) {
    const { duration_ms: _ms, ...rest } = patch;
    void _ms;
    mem.state = { ...mem.state, ...rest, lock_until: 0 };
    return;
  }
  await supabase().from("catalog_sources").update({ ...patch, lock_until: null }).eq("source", STATE);
}

async function save(rows: SallaService[]) {
  const now = new Date().toISOString();
  if (!supabaseEnabled) {
    mem.rows = rows;
    return;
  }
  const db = supabase();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("partner_services").upsert(
      rows.slice(i, i + 500).map((r) => ({ ...r, partner: "salla", active: true, seen_at: now })),
      { onConflict: "key" },
    );
    if (error) throw new Error(`services save: ${error.message}`);
  }
  // Gone from the directory (hidden, paused, switched off) → not shown.
  await db.from("partner_services").update({ active: false }).eq("partner", "salla").eq("active", true).lt("seen_at", now);
}

export interface ServicesRefresh {
  source: "salla_services";
  status: "fresh" | "locked" | "updated" | "failed" | "skipped";
  items?: number;
  ms?: number;
  error?: string;
}

/** Pull the directory when it is older than an hour (or with force). Never throws. */
export async function refreshSallaServices(opts: { force?: boolean } = {}): Promise<ServicesRefresh> {
  const started = Date.now();
  if (!sallaApiReady()) return { source: STATE, status: "skipped" };
  try {
    const st = await readState();
    if (!opts.force && st?.refreshed_at && Date.now() - Date.parse(st.refreshed_at) < TTL_MIN * 60_000) return { source: STATE, status: "fresh", items: st.items };
    if (!(await claim())) return { source: STATE, status: "locked" };
    const etag = st?.ok && st.meta?.map === MAP && st.items > 0 ? st.meta.etag : undefined;
    try {
      const r = await pull(etag);
      const now = new Date().toISOString();
      if (r.notModified) {
        await finish({ refreshed_at: now, ok: true, error: null, duration_ms: Date.now() - started });
        return { source: STATE, status: "updated", items: st?.items ?? 0, ms: Date.now() - started };
      }
      // An empty directory is far more likely a fault on the way than every app switched off.
      if (!r.rows.length && (st?.items ?? 0) > 0) throw new Error("empty services directory");
      await save(r.rows);
      await finish({ refreshed_at: now, items: r.rows.length, ok: true, error: null, meta: { etag: r.etag, version: r.version, map: MAP }, duration_ms: Date.now() - started });
      return { source: STATE, status: "updated", items: r.rows.length, ms: Date.now() - started };
    } catch (e) {
      await finish({ ok: false, error: (e as Error).message.slice(0, 300), duration_ms: Date.now() - started }).catch(() => {});
      throw e;
    }
  } catch (e) {
    return { source: STATE, status: "failed", error: (e as Error).message, ms: Date.now() - started };
  }
}

/* ---------------- reading ---------------- */

let loaded: { at: number; key: string; rows: SallaService[] } | null = null;
const COLS = "key, type, name, name_ar, image, countries, city, category, specialty, provider, price, price_unit, rating, ratings, url";

async function all(): Promise<SallaService[]> {
  if (!supabaseEnabled) return mem.rows;
  if (loaded && Date.now() - loaded.at < 60_000) return loaded.rows;
  const st = await readState().catch(() => null);
  const key = `${st?.refreshed_at ?? "-"}/${st?.items ?? 0}`;
  if (loaded && loaded.key === key) {
    loaded.at = Date.now();
    return loaded.rows;
  }
  const rows: SallaService[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase().from("partner_services").select(COLS).eq("partner", "salla").eq("active", true).order("key").range(from, from + 999);
    if (error) {
      // Database slow or down: the last copy of this instance, tried again in a minute.
      if (loaded) {
        loaded.at = Date.now();
        return loaded.rows;
      }
      throw new Error(`services load: ${error.message}`);
    }
    rows.push(...((data ?? []) as SallaService[]).map((r) => ({ ...r, price: r.price == null ? null : Number(r.price), rating: r.rating == null ? null : Number(r.rating) })));
    if ((data ?? []).length < 1000) break;
  }
  loaded = { at: Date.now(), key, rows };
  return rows;
}

const works = (s: SallaService, country: string) => !s.countries.length || s.countries.includes(country);

/** Entries usable in a country, best rated first; optional type and words (name, category, city…). */
export async function sallaServices(opts: { country: string; type?: ServiceType; q?: string; limit?: number }): Promise<{ services: SallaService[]; types: Partial<Record<ServiceType, number>>; total: number }> {
  // The owner hid Salla Shop from the site (/admin): its apps go with it.
  if ((await hiddenSources()).has("salla")) return { services: [], types: {}, total: 0 };
  const rows = (await all()).filter((s) => works(s, opts.country));
  const types: Partial<Record<ServiceType, number>> = {};
  for (const s of rows) types[s.type] = (types[s.type] ?? 0) + 1;
  const words = normText(opts.q ?? "")
    .split(" ")
    .filter((w) => w.length >= 2);
  let list = opts.type ? rows.filter((s) => s.type === opts.type) : rows;
  if (words.length) {
    list = list.filter((s) => {
      const hay = normText([s.name, s.name_ar, s.category, s.specialty, s.provider, s.city, s.type.replace("_", " ")].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    });
  }
  // Rated (and more ratings) first, then the ones with a photo; stable by name.
  list = [...list].sort((a, b) => (b.rating ?? 0) * Math.log2(2 + (b.ratings ?? 0)) - (a.rating ?? 0) * Math.log2(2 + (a.ratings ?? 0)) || +!!b.image - +!!a.image || a.name.localeCompare(b.name));
  return { services: list.slice(0, Math.min(opts.limit ?? 30, 100)), types, total: list.length };
}

/** Tests: forget the in-memory directory. */
export function resetServicesMemory() {
  mem.rows = [];
  mem.state = { refreshed_at: null, items: 0, ok: null, error: null, meta: {} };
  loaded = null;
}
