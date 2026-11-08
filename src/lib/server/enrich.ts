import "server-only";
import { hostedConfig, hostedEnabled } from "./hosted";
import { streamChat } from "./meta";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Dalil Index — AI enrichment. Each new or changed product is read ONCE by the model, 20 per call:
 * brand, model, one normalized category, an English and an Arabic title and a few search
 * keywords. brand + model give the "twin key" that finds the same product in other stores.
 * Plain code does everything else; unchanged products are never sent again (hash check).
 */

export const CATEGORIES = [
  "phones", "headphones", "computers", "tv_audio", "appliances", "home", "fashion", "shoes", "beauty", "perfume",
  "grocery", "kids", "sports", "vehicles", "topup", "gift_cards", "services", "collectibles", "real_estate", "other",
] as const;
export type NormCategory = (typeof CATEGORIES)[number];

export interface Enrichment {
  brand: string | null;
  model: string | null;
  norm_category: NormCategory;
  title_en: string | null;
  title_ar: string | null;
  keywords: string[];
  twin_key: string | null;
}

interface Pending {
  id: string;
  title: string;
  title_ar?: string | null;
  description?: string | null;
  category?: string | null;
  hash?: string | null;
}

const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() && !/^(n\/?a|none|null|unknown|-)$/i.test(v.trim()) ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const keyPart = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

/** "Anker" + "Soundcore Q20i" → "anker|soundcoreq20i"; generic models ("wireless") give no key. */
export function twinKey(brand: string | null, model: string | null): string | null {
  if (!brand || !model) return null;
  const b = keyPart(brand);
  const m = keyPart(model.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), ""));
  // A real model name has a digit or is a distinctive word of 4+ letters.
  if (b.length < 2 || m.length < 2 || (!/\d/.test(m) && m.length < 4)) return null;
  return `${b}|${m}`;
}

export function parseEnrichment(raw: unknown): Enrichment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const cat = String(r.category ?? "other").toLowerCase().trim();
  const brand = clean(r.brand, 40);
  const model = clean(r.model, 60);
  return {
    brand,
    model,
    norm_category: (CATEGORIES as readonly string[]).includes(cat) ? (cat as NormCategory) : "other",
    title_en: clean(r.title_en, 160),
    title_ar: clean(r.title_ar, 160),
    keywords: (Array.isArray(r.keywords) ? r.keywords : []).map((k) => clean(k, 30)).filter(Boolean).slice(0, 8) as string[],
    twin_key: twinKey(brand, model),
  };
}

const PROMPT = `You tidy product listings from Pi Network marketplaces (Egypt, Middle East, worldwide).
For EACH product return one JSON object: {"id","brand","model","category","title_en","title_ar","keywords"}.
- brand: the manufacturer (e.g. "Anker", "Apple", "Oraimo"), null if none/unknown/handmade.
- model: the exact model name/number without the brand (e.g. "Soundcore Q20i", "iPhone 14 Pro 128GB", "SpaceBuds 2"), null if none.
- category: exactly one of ${CATEGORIES.join(", ")}.
- title_en / title_ar: a short clear product title in English / Egyptian-friendly Arabic (max 80 chars), no prices, no emojis.
- keywords: 3-6 short search words people would type (mix English and Arabic), e.g. ["earbuds","bluetooth","سماعة"].
Use only what the listing says; never invent specs. Answer with ONLY a JSON array, nothing else.`;

async function ask(items: Pending[]): Promise<Map<string, Enrichment>> {
  const input = items.map((i) => ({ id: i.id, title: i.title, title_ar: i.title_ar ?? undefined, category: i.category ?? undefined, description: i.description?.slice(0, 220) }));
  const gen = streamChat(hostedConfig("low"), [
    { role: "developer", content: PROMPT },
    { role: "user", content: JSON.stringify(input) },
  ], [], undefined, "none");
  let text = "";
  for (;;) {
    const r = await gen.next();
    if (r.done) {
      text = r.value.text || text;
      break;
    }
    text += r.value.text;
  }
  const m = text.match(/\[[\s\S]*\]/);
  const out = new Map<string, Enrichment>();
  if (!m) {
    lastError = `no JSON array in the answer: ${text.slice(0, 160)}`;
    return out;
  }
  let arr: unknown;
  try {
    arr = JSON.parse(m[0]);
  } catch (e) {
    lastError = `bad JSON: ${(e as Error).message} — ${m[0].slice(0, 120)}`;
    return out;
  }
  const ids = new Set(items.map((i) => i.id));
  for (const raw of Array.isArray(arr) ? arr : []) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== "string" || !ids.has(id)) continue; // only the products we asked about
    const e = parseEnrichment(raw);
    if (e) out.set(id, e);
  }
  return out;
}

/* ---------- storage (Supabase, or memory in tests) ---------- */

export type MemCatalogRow = Pending & Partial<Enrichment> & { active?: boolean; enriched_hash?: string | null };
type MemItem = MemCatalogRow;
let memSource: (() => MemItem[]) | null = null;
let onMemChange: (() => void) | null = null;
/** Tests / no database: catalog.ts hands its in-memory rows over. */
export function attachMemoryCatalog(rows: () => MemItem[], changed: () => void) {
  memSource = rows;
  onMemChange = changed;
}

async function pending(limit: number): Promise<Pending[]> {
  if (!supabaseEnabled) return (memSource?.() ?? []).filter((r) => r.active !== false && r.enriched_hash !== (r.hash ?? r.title)).slice(0, limit);
  // New products have no enrichment; changed ones get it cleared by a trigger (migration 0014).
  const { data, error } = await supabase().from("catalog_items").select("id, title, title_ar, description, category, hash").eq("active", true).is("enriched_hash", null).limit(limit);
  if (error) throw new Error(`enrich: ${error.message}`);
  return (data ?? []) as Pending[];
}

async function save(items: Pending[], got: Map<string, Enrichment>): Promise<number> {
  let n = 0;
  if (!supabaseEnabled) {
    for (const r of memSource?.() ?? []) {
      const e = got.get(r.id);
      if (!e) continue;
      Object.assign(r, e, { title_ar: r.title_ar ?? e.title_ar, enriched_hash: r.hash ?? r.title });
      n++;
    }
    onMemChange?.();
    return n;
  }
  const db = supabase();
  const rows = items.filter((i) => got.has(i.id));
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map(async (it) => {
        const e = got.get(it.id)!;
        const { error } = await db
          .from("catalog_items")
          .update({ brand: e.brand, model: e.model, norm_category: e.norm_category, title_en: e.title_en, title_ar: it.title_ar ?? e.title_ar, keywords: e.keywords, twin_key: e.twin_key, enriched_hash: it.hash ?? "nohash" })
          .eq("id", it.id);
        if (!error) n++;
      }),
    );
  }
  if (n) {
    // Let every server instance reload its in-memory index (it watches catalog_sources).
    const { data } = await db.from("catalog_sources").select("source, meta");
    await Promise.all((data ?? []).map((s) => db.from("catalog_sources").update({ meta: { ...(s.meta as object), enriched_at: new Date().toISOString() } }).eq("source", s.source)));
  }
  return n;
}

let running: Promise<{ enriched: number; left: number; error?: string }> | null = null;
/** Why the last batch gave nothing (shown by /api/cron/catalog for diagnosis). */
let lastError: string | undefined;
let lastRun = 0;

/**
 * Enrich up to `limit` products (batches of 20, 2 at a time). Never throws; one run at a time per
 * instance, and `minGapMs` keeps background runs from piling up.
 */
export async function enrichPending(limit = 40, minGapMs = 0): Promise<{ enriched: number; left: number; skipped?: string; error?: string }> {
  if (!hostedEnabled()) return { enriched: 0, left: -1, skipped: "no AI key" };
  if (running) return running;
  if (Date.now() - lastRun < minGapMs) return { enriched: 0, left: -1, skipped: "recently ran" };
  lastRun = Date.now();
  lastError = undefined;
  running = (async () => {
    try {
      const todo = await pending(limit);
      let done = 0;
      for (let i = 0; i < todo.length; i += 40) {
        const batches = [todo.slice(i, i + 20), todo.slice(i + 20, i + 40)].filter((b) => b.length);
        const results = await Promise.all(
          batches.map((b) =>
            ask(b).catch((e: Error) => {
              lastError = e.message.slice(0, 300);
              return new Map<string, Enrichment>();
            }),
          ),
        );
        for (let k = 0; k < batches.length; k++) done += await save(batches[k], results[k]);
      }
      const left = (await pending(1).catch(() => [])).length;
      return { enriched: done, left, ...(done === 0 && lastError ? { error: lastError } : {}) };
    } catch (e) {
      return { enriched: 0, left: -1, error: (e as Error).message };
    } finally {
      running = null;
    }
  })();
  return running;
}
