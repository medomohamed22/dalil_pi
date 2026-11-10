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

export interface StoreReport {
  store: string;
  visits: number;
  orders: number;
  buyers: number;
  prev: { visits: number; orders: number };
  countries: Array<{ country: string; n: number }>;
  topProducts: Array<{ title: string; url: string; visits: number; orders: number }>;
}
export interface MonthReport {
  month: string;
  stores: StoreReport[];
  totals: { visits: number; orders: number };
}

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
};
const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

type ClickRow = { at: string; store: string; url?: string | null; title?: string | null; kind: string; country?: string | null; pi_uid?: string | null };
async function clicksBetween(from: string, to: string): Promise<ClickRow[]> {
  if (!supabaseEnabled) return mem.clicks.filter((c) => c.at >= from && c.at < to).map((c) => ({ ...c, pi_uid: c.uid ?? null }));
  return allRows<ClickRow>((a, b) => supabase().from("click_events").select("at, store, url, title, kind, country, pi_uid").gte("at", from).lt("at", to).order("at").order("id").range(a, b));
}

/**
 * What Dalil Pi sent each store in one calendar month (UTC): visits, orders, distinct signed-in
 * buyers (counted, never listed), countries and top products, with last month for comparison.
 */
export async function monthReport(month: string): Promise<MonthReport> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Object.assign(new Error("month must be YYYY-MM"), { status: 400 });
  const cur = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const [now, before] = await Promise.all([clicksBetween(cur.from, cur.to), clicksBetween(prev.from, prev.to)]);
  const by = new Map<string, StoreReport & { _buyers: Set<string>; _countries: Map<string, number>; _products: Map<string, { title: string; url: string; visits: number; orders: number }> }>();
  const get = (store: string) => {
    let s = by.get(store);
    if (!s) {
      s = { store, visits: 0, orders: 0, buyers: 0, prev: { visits: 0, orders: 0 }, countries: [], topProducts: [], _buyers: new Set(), _countries: new Map(), _products: new Map() };
      by.set(store, s);
    }
    return s;
  };
  for (const c of now) {
    const s = get(c.store);
    const order = c.kind === "order";
    if (order) s.orders++;
    else s.visits++;
    if (c.pi_uid) s._buyers.add(c.pi_uid);
    if (c.country) s._countries.set(c.country, (s._countries.get(c.country) ?? 0) + 1);
    if (c.url) {
      const p = s._products.get(c.url) ?? { title: c.title ?? c.url, url: c.url, visits: 0, orders: 0 };
      if (order) p.orders++;
      else p.visits++;
      s._products.set(c.url, p);
    }
  }
  for (const c of before) {
    const s = get(c.store);
    if (c.kind === "order") s.prev.orders++;
    else s.prev.visits++;
  }
  const stores = [...by.values()]
    .map(({ _buyers, _countries, _products, ...s }) => ({
      ...s,
      buyers: _buyers.size,
      countries: [..._countries].map(([country, n]) => ({ country, n })).sort((a, b) => b.n - a.n).slice(0, 5),
      topProducts: [..._products.values()].sort((a, b) => b.orders * 3 + b.visits - (a.orders * 3 + a.visits)).slice(0, 5),
    }))
    .filter((s) => s.visits + s.orders + s.prev.visits + s.prev.orders > 0)
    .sort((a, b) => b.orders + b.visits - (a.orders + a.visits));
  return { month, stores, totals: { visits: stores.reduce((n, s) => n + s.visits, 0), orders: stores.reduce((n, s) => n + s.orders, 0) } };
}

/** CSV (Excel opens it; BOM so Arabic titles show right). Cells starting with = + - @ are quoted as text. */
export function reportCsv(r: MonthReport): string {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["month", "store", "visits", "orders", "buyers", "visits_prev_month", "orders_prev_month", "top_countries", "top_product", "top_product_url"]];
  for (const s of r.stores) {
    rows.push([r.month, s.store, String(s.visits), String(s.orders), String(s.buyers), String(s.prev.visits), String(s.prev.orders), s.countries.map((c) => `${c.country}:${c.n}`).join(" "), s.topProducts[0]?.title ?? "", s.topProducts[0]?.url ?? ""]);
  }
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
