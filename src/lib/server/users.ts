import "server-only";
import { counters } from "./store";
import { supabase, supabaseEnabled } from "./supabase";
import type { Lang, Usage } from "../types";

/**
 * Users and monthly quotas, keyed by the app-specific Pi uid. Free plan
 * limits come from the environment (FREE_SEARCHES_PER_MONTH /
 * FREE_ORDERS_PER_MONTH). Usage is counted AFTER a search succeeds.
 */

export function freeLimits() {
  return {
    searches: Math.max(0, Number(process.env.FREE_SEARCHES_PER_MONTH ?? 5) || 0),
    orders: Math.max(0, Number(process.env.FREE_ORDERS_PER_MONTH ?? 5) || 0),
  };
}

/** Max searches per user per hour, on every plan. */
export const HOURLY_SEARCH_LIMIT = Number(process.env.HOURLY_SEARCH_LIMIT) || 10;

export function currentPeriod(d = new Date()): string {
  return d.toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/** First day of next month (UTC) — when the free quota renews. */
export function renewsAt(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

/* -------- in-memory fallback for local development without Supabase -------- */
interface MemUser {
  username?: string;
  country?: string | null;
  lang: Lang;
}
const mem = globalThis as unknown as {
  __dalilUsers?: Map<string, MemUser>;
  __dalilUsage?: Map<string, { searches: number; orders: number; bonus: number }>;
};
const memUsers = (mem.__dalilUsers ??= new Map());
const memUsage = (mem.__dalilUsage ??= new Map());

export async function upsertUser(uid: string, username?: string): Promise<{ country: string | null; lang: Lang }> {
  if (!supabaseEnabled) {
    const cur = memUsers.get(uid);
    const next = { username: username ?? cur?.username, country: cur?.country ?? null, lang: cur?.lang ?? "en" };
    memUsers.set(uid, next);
    return { country: next.country, lang: next.lang };
  }
  const db = supabase();
  const { error } = await db
    .from("users")
    .upsert({ pi_uid: uid, username: username ?? null, last_seen_at: new Date().toISOString() }, { onConflict: "pi_uid", ignoreDuplicates: false });
  if (error) throw new Error(`users: ${error.message}`);
  const { data } = await db.from("users").select("country, lang").eq("pi_uid", uid).single();
  return { country: (data?.country as string | null) ?? null, lang: (data?.lang as Lang) ?? "en" };
}

export async function updatePrefs(uid: string, prefs: { country?: string | null; lang?: Lang }): Promise<void> {
  if (!supabaseEnabled) {
    const cur = memUsers.get(uid) ?? { lang: "en" as Lang };
    memUsers.set(uid, { ...cur, ...prefs });
    return;
  }
  const patch: Record<string, unknown> = {};
  if (prefs.country !== undefined) patch.country = prefs.country;
  if (prefs.lang !== undefined) patch.lang = prefs.lang;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase().from("users").update(patch).eq("pi_uid", uid);
  if (error) throw new Error(`users: ${error.message}`);
}

/**
 * With Supabase, the quota comes from `user_quota()`: the active paid plan
 * (subscriptions) or the free plan (plans table), plus this month's top-ups
 * and bonus searches. The free plan's numbers live in the `plans` table.
 */
export async function getUsage(uid: string): Promise<Usage> {
  const period = currentPeriod();
  const limits = freeLimits();
  let row = { searches: 0, orders: 0, bonus: 0 };
  if (!supabaseEnabled) {
    row = memUsage.get(`${uid}:${period}`) ?? row;
  } else {
    const q = await supabase().rpc("user_quota", { p_uid: uid, p_period: period });
    if (!q.error && Array.isArray(q.data) && q.data[0]) {
      const r = q.data[0] as { plan: Usage["plan"]; searches_quota: number; orders_quota: number; ends_at: string | null; searches_used: number; orders_used: number };
      return {
        plan: r.plan,
        planEndsAt: r.ends_at,
        period,
        renewsAt: r.plan !== "free" && r.ends_at ? r.ends_at : renewsAt(),
        searchesUsed: r.searches_used,
        searchLimit: r.searches_quota,
        ordersUsed: r.orders_used,
        orderLimit: r.orders_quota,
      };
    }
    // Older schema (before migration 0002): usage table + free limits from the environment.
    const { data, error } = await supabase()
      .from("usage")
      .select("searches, orders, bonus_searches")
      .eq("pi_uid", uid)
      .eq("period", period)
      .maybeSingle();
    if (error) throw new Error(`usage: ${error.message}`);
    if (data) row = { searches: data.searches ?? 0, orders: data.orders ?? 0, bonus: data.bonus_searches ?? 0 };
  }
  return {
    plan: "free",
    period,
    renewsAt: renewsAt(),
    searchesUsed: row.searches,
    searchLimit: limits.searches + row.bonus,
    ordersUsed: row.orders,
    orderLimit: limits.orders,
  };
}

export class QuotaExceeded extends Error {
  status = 402;
  code = "QUOTA_EXCEEDED";
  constructor(public usage: Usage) {
    super("You've used all your free searches this month.");
  }
}

export class TooFast extends Error {
  status = 429;
  code = "HOURLY_LIMIT";
  constructor() {
    super(`You can run up to ${HOURLY_SEARCH_LIMIT} searches per hour. Please try again a bit later.`);
  }
}

/** Throws when the user has no searches left (checked BEFORE the AI runs). */
export async function assertCanSearch(uid: string): Promise<Usage> {
  const usage = await getUsage(uid);
  if (usage.searchesUsed >= usage.searchLimit) throw new QuotaExceeded(usage);
  const hour = Math.floor(Date.now() / 3_600_000);
  const n = await counters.incr(`search-hour:${uid}:${hour}`, 3700);
  if (n > HOURLY_SEARCH_LIMIT) throw new TooFast();
  return usage;
}

/** Counts one search (called only after the search returned results). */
export async function recordSearch(uid: string): Promise<Usage> {
  const period = currentPeriod();
  if (!supabaseEnabled) {
    const k = `${uid}:${period}`;
    const cur = memUsage.get(k) ?? { searches: 0, orders: 0, bonus: 0 };
    memUsage.set(k, { ...cur, searches: cur.searches + 1 });
  } else {
    const { error } = await supabase().rpc("add_usage", { p_uid: uid, p_period: period, p_searches: 1, p_orders: 0 });
    if (error) throw new Error(`usage: ${error.message}`);
  }
  return getUsage(uid);
}

export class OrderQuotaExceeded extends Error {
  status = 402;
  code = "ORDER_QUOTA_EXCEEDED";
  constructor(public usage: Usage) {
    super("You've used all your automatic orders this month.");
  }
}

/** Throws when the user has no automatic orders left. */
export async function assertCanOrder(uid: string): Promise<Usage> {
  const usage = await getUsage(uid);
  if (usage.ordersUsed >= usage.orderLimit) throw new OrderQuotaExceeded(usage);
  return usage;
}

/** Counts one automatic order. */
export async function recordOrder(uid: string): Promise<Usage> {
  const period = currentPeriod();
  if (!supabaseEnabled) {
    const k = `${uid}:${period}`;
    const cur = memUsage.get(k) ?? { searches: 0, orders: 0, bonus: 0 };
    memUsage.set(k, { ...cur, orders: cur.orders + 1 });
  } else {
    const { error } = await supabase().rpc("add_usage", { p_uid: uid, p_period: period, p_searches: 0, p_orders: 1 });
    if (error) throw new Error(`usage: ${error.message}`);
  }
  return getUsage(uid);
}

/** Saved profile fields (name/phone/email shown on orders). */
export async function updateProfile(uid: string, p: { displayName?: string | null; phone?: string | null; email?: string | null }): Promise<void> {
  if (!supabaseEnabled) return;
  const patch: Record<string, unknown> = {};
  if (p.displayName !== undefined) patch.display_name = p.displayName;
  if (p.phone !== undefined) patch.phone = p.phone;
  if (p.email !== undefined) patch.email = p.email;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase().from("users").update(patch).eq("pi_uid", uid);
  if (error) throw new Error(`users: ${error.message}`);
}
