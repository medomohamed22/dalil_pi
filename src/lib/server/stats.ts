import "server-only";
import { allRows, supabase, supabaseEnabled } from "./supabase";

/**
 * Traffic Dalil Pi sends to stores (visits + orders) and searches that found nothing.
 * The numbers partners care about: "Dalil Pi sent you N visitors and M orders this month",
 * and "people looked for X and nobody in Pi sells it yet".
 */

export interface ClickInput {
  store: string;
  url?: string;
  title?: string;
  kind: "visit" | "order";
  country?: string;
  uid?: string;
}

type MemClick = ClickInput & { at: string; domain?: string };
type MemMiss = { q: string; country: string; n: number; last_at: string };
const g = globalThis as unknown as { __dalilStats?: { clicks: MemClick[]; misses: Map<string, MemMiss> } };
const mem = (g.__dalilStats ??= { clicks: [] as MemClick[], misses: new Map<string, MemMiss>() });

const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : undefined;
  } catch {
    return undefined;
  }
};

export async function recordClick(c: ClickInput): Promise<void> {
  const row = { store: c.store.slice(0, 80), domain: hostOf(c.url), url: c.url?.slice(0, 500), title: c.title?.slice(0, 200), kind: c.kind, country: c.country, pi_uid: c.uid ?? null };
  if (!supabaseEnabled) {
    mem.clicks.push({ ...c, domain: row.domain, at: new Date().toISOString() });
    if (mem.clicks.length > 5000) mem.clicks.shift();
    return;
  }
  const { error } = await supabase().from("click_events").insert(row);
  if (error) throw new Error(`click: ${error.message}`);
}

/** Normalised so "Laptop " and "laptop" count as one. */
const normQ = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

export async function recordMiss(q: string, country: string): Promise<void> {
  const k = normQ(q);
  if (k.length < 2) return;
  if (!supabaseEnabled) {
    const key = `${k}|${country}`;
    const cur = mem.misses.get(key);
    mem.misses.set(key, { q: k, country, n: (cur?.n ?? 0) + 1, last_at: new Date().toISOString() });
    return;
  }
  const { error } = await supabase().rpc("record_miss", { p_q: k, p_country: country });
  if (error) throw new Error(`miss: ${error.message}`);
}

export interface AdminStats {
  days: number;
  totals: { visits: number; orders: number; misses: number };
  stores: Array<{ store: string; visits: number; orders: number; last7: number }>;
  daily: Array<{ day: string; visits: number; orders: number }>;
  topProducts: Array<{ store: string; title: string; url: string; visits: number; orders: number }>;
  misses: Array<{ q: string; country: string; n: number; last_at: string }>;
  countries: Array<{ country: string; n: number }>;
}

export async function adminStats(days = 30): Promise<AdminStats> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  let clicks: Array<{ at: string; store: string; url?: string | null; title?: string | null; kind: string; country?: string | null }>;
  let misses: Array<{ q: string; country: string; n: number; last_at: string }>;
  if (!supabaseEnabled) {
    clicks = mem.clicks.filter((c) => c.at >= since);
    misses = [...mem.misses.values()].sort((a, b) => b.n - a.n).slice(0, 50);
  } else {
    const [a, b] = await Promise.all([
      allRows<(typeof clicks)[number]>((from, to) => supabase().from("click_events").select("at, store, url, title, kind, country").gte("at", since).order("at", { ascending: false }).order("id").range(from, to)),
      supabase().from("search_misses").select("q, country, n, last_at").gte("last_at", since).order("n", { ascending: false }).limit(50),
    ]);
    if (b.error) throw new Error(b.error.message);
    clicks = a;
    misses = b.data ?? [];
  }
  const week = Date.now() - 7 * 864e5;
  const stores = new Map<string, { store: string; visits: number; orders: number; last7: number }>();
  const daily = new Map<string, { day: string; visits: number; orders: number }>();
  const products = new Map<string, { store: string; title: string; url: string; visits: number; orders: number }>();
  const countries = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    daily.set(d, { day: d, visits: 0, orders: 0 });
  }
  for (const c of clicks) {
    const isOrder = c.kind === "order";
    const s = stores.get(c.store) ?? { store: c.store, visits: 0, orders: 0, last7: 0 };
    if (isOrder) s.orders++;
    else s.visits++;
    if (Date.parse(c.at) >= week) s.last7++;
    stores.set(c.store, s);
    const d = daily.get(c.at.slice(0, 10));
    if (d) {
      if (isOrder) d.orders++;
      else d.visits++;
    }
    if (c.url) {
      const p = products.get(c.url) ?? { store: c.store, title: c.title ?? c.url, url: c.url, visits: 0, orders: 0 };
      if (isOrder) p.orders++;
      else p.visits++;
      products.set(c.url, p);
    }
    if (c.country) countries.set(c.country, (countries.get(c.country) ?? 0) + 1);
  }
  return {
    days,
    totals: { visits: clicks.filter((c) => c.kind !== "order").length, orders: clicks.filter((c) => c.kind === "order").length, misses: misses.reduce((n, m) => n + m.n, 0) },
    stores: [...stores.values()].sort((a, b) => b.orders + b.visits - (a.orders + a.visits)),
    daily: [...daily.values()],
    topProducts: [...products.values()].sort((a, b) => b.orders * 3 + b.visits - (a.orders * 3 + a.visits)).slice(0, 15),
    misses,
    countries: [...countries].map(([country, n]) => ({ country, n })).sort((a, b) => b.n - a.n).slice(0, 10),
  };
}
