import "server-only";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Owner settings kept in the database (app_settings): what the home page features, stores hidden
 * from the site, a site-wide announcement, and the admin password hash. Read through a 60 s cache.
 */
export interface SiteSettings {
  featured: { store: string; cats: string; title_en: string; title_ar: string };
  /** Store directory ids hidden everywhere (e.g. "piketplace"). */
  hidden_stores: string[];
  announcement: { on: boolean; en: string; ar: string };
}

export const DEFAULTS: SiteSettings = {
  featured: { store: "salla", cats: "phones,headphones,computers,tv_audio", title_en: "Phones & electronics", title_ar: "موبايلات وإلكترونيات" },
  hidden_stores: [],
  announcement: { on: false, en: "", ar: "" },
};

const mem = ((globalThis as unknown as { __dalilSettings?: Map<string, unknown> }).__dalilSettings ??= new Map());
let cache: { at: number; rows: Map<string, unknown> } | null = null;

async function rows(): Promise<Map<string, unknown>> {
  if (!supabaseEnabled) return mem;
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  try {
    const { data, error } = await supabase().from("app_settings").select("key, value");
    if (error) throw error;
    cache = { at: Date.now(), rows: new Map((data ?? []).map((r) => [r.key as string, r.value])) };
  } catch {
    // Table missing (migration 0015 not run yet) → defaults.
    cache = { at: Date.now(), rows: new Map() };
  }
  return cache.rows;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await rows();
  return r.has(key) ? (r.get(key) as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (!supabaseEnabled) {
    mem.set(key, value);
    return;
  }
  const { error } = await supabase().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(/app_settings/.test(error.message) ? "Run supabase/migrations/0015_settings_no_free_ai.sql first." : error.message);
  cache = null;
}

export async function siteSettings(): Promise<SiteSettings> {
  const [featured, hidden, announcement] = await Promise.all([
    getSetting("featured", DEFAULTS.featured),
    getSetting<string[]>("hidden_stores", DEFAULTS.hidden_stores),
    getSetting("announcement", DEFAULTS.announcement),
  ]);
  return { featured: { ...DEFAULTS.featured, ...featured }, hidden_stores: Array.isArray(hidden) ? hidden : [], announcement: { ...DEFAULTS.announcement, ...announcement } };
}

/** Directory id → Dalil Index source, for hiding a store's products. */
export const SOURCE_OF: Record<string, string> = { pcm: "pcm", salla: "salla", gtp: "gtp", piketplace: "pkt" };

export async function hiddenSources(): Promise<Set<string>> {
  const s = await siteSettings();
  return new Set(s.hidden_stores.map((id) => SOURCE_OF[id]).filter(Boolean));
}
