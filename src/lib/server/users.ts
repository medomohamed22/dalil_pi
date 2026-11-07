import "server-only";
import { counters } from "./store";
import { supabase, supabaseEnabled } from "./supabase";
import type { Lang, Pack, PaidPlanId, PlanId, Usage } from "../types";

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

/* ---------------- plans & 30-day packs ---------------- */

/** The plan shop. Prices are in USD; the Pi price is computed from OKX when bought. Mirrors public.plans. */
export const PLAN_CATALOG: Record<PaidPlanId, { priceUsd: number; searches: number; orders: number; days: number; tier: number }> = {
  basic: { priceUsd: 1.99, searches: 60, orders: 60, days: 30, tier: 1 },
  plus: { priceUsd: 4.99, searches: 180, orders: 180, days: 30, tier: 2 },
  pro: { priceUsd: 9.99, searches: 380, orders: 380, days: 30, tier: 3 },
  topup: { priceUsd: 0.79, searches: 20, orders: 20, days: 30, tier: 0 },
};

interface MemPack extends Pack {
  uid: string;
  paymentId?: string;
}
const memPacks = ((globalThis as unknown as { __dalilPacks?: MemPack[] }).__dalilPacks ??= []);

/** Active packs of a user (not expired), soonest to expire first. */
export async function listPacks(uid: string): Promise<Pack[]> {
  const now = Date.now();
  if (!supabaseEnabled) {
    return memPacks
      .filter((p) => p.uid === uid && Date.parse(p.endsAt) > now)
      .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
      .map(({ uid: _u, paymentId: _p, ...p }) => p);
  }
  const { data, error } = await supabase()
    .from("subscriptions")
    .select("id, plan, searches_quota, orders_quota, searches_used, orders_used, starts_at, ends_at")
    .eq("pi_uid", uid)
    .eq("status", "active")
    .gt("ends_at", new Date(now).toISOString())
    .order("ends_at", { ascending: true })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: String(r.id),
    plan: r.plan as PaidPlanId,
    searchesQuota: r.searches_quota,
    ordersQuota: r.orders_quota,
    searchesLeft: Math.max(0, r.searches_quota - (r.searches_used ?? 0)),
    ordersLeft: Math.max(0, r.orders_quota - (r.orders_used ?? 0)),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  }));
}

/** Local-dev twin of public.activate_payment(): one 30-day pack per payment. */
export function memActivate(uid: string, plan: PaidPlanId, paymentId: string): void {
  if (memPacks.some((p) => p.paymentId === paymentId)) return;
  const c = PLAN_CATALOG[plan];
  const start = new Date();
  memPacks.push({
    uid,
    paymentId,
    id: String(memPacks.length + 1),
    plan,
    searchesQuota: c.searches,
    ordersQuota: c.orders,
    searchesLeft: c.searches,
    ordersLeft: c.orders,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + c.days * 86_400_000).toISOString(),
  });
}

function summarize(base: { searches: number; orders: number; bonus: number }, packs: Pack[]): Usage {
  const free = freeLimits();
  const period = currentPeriod();
  const plans = packs.filter((p) => p.plan !== "topup").sort((a, b) => PLAN_CATALOG[b.plan].tier - PLAN_CATALOG[a.plan].tier);
  const plan = (plans[0]?.plan as PlanId | undefined) ?? "free";
  const planEndsAt = plans.length ? plans.map((p) => p.endsAt).sort().at(-1)! : null;
  const sum = (f: (p: Pack) => number) => packs.reduce((n, p) => n + f(p), 0);
  return {
    plan,
    planEndsAt,
    period,
    renewsAt: renewsAt(),
    searchesUsed: Math.min(base.searches, free.searches + base.bonus) + sum((p) => p.searchesQuota - p.searchesLeft),
    searchLimit: free.searches + base.bonus + sum((p) => p.searchesQuota),
    ordersUsed: Math.min(base.orders, free.orders) + sum((p) => p.ordersQuota - p.ordersLeft),
    orderLimit: free.orders + sum((p) => p.ordersQuota),
    packs,
  };
}

/**
 * Quota right now = the free monthly allowance + every 30-day pack that
 * hasn't expired. With Supabase the numbers come from `user_quota()`.
 */
export async function getUsage(uid: string): Promise<Usage> {
  const period = currentPeriod();
  if (!supabaseEnabled) {
    return summarize(memUsage.get(`${uid}:${period}`) ?? { searches: 0, orders: 0, bonus: 0 }, await listPacks(uid));
  }
  const [q, packs] = await Promise.all([supabase().rpc("user_quota", { p_uid: uid, p_period: period }), listPacks(uid)]);
  if (!q.error && Array.isArray(q.data) && q.data[0]) {
    const r = q.data[0] as { plan: PlanId; searches_quota: number; orders_quota: number; ends_at: string | null; searches_used: number; orders_used: number };
    return {
      plan: r.plan,
      planEndsAt: r.ends_at,
      period,
      renewsAt: renewsAt(),
      searchesUsed: r.searches_used,
      searchLimit: r.searches_quota,
      ordersUsed: r.orders_used,
      orderLimit: r.orders_quota,
      packs,
    };
  }
  // Older schema (before migration 0002): usage table + free limits from the environment.
  const { data, error } = await supabase().from("usage").select("searches, orders, bonus_searches").eq("pi_uid", uid).eq("period", period).maybeSingle();
  if (error) throw new Error(`usage: ${error.message}`);
  return summarize({ searches: data?.searches ?? 0, orders: data?.orders ?? 0, bonus: data?.bonus_searches ?? 0 }, []);
}

export class QuotaExceeded extends Error {
  status = 402;
  code = "QUOTA_EXCEEDED";
  constructor(public usage: Usage) {
    super(usage.plan === "free" ? "You've used all your free searches this month." : "You've used all the searches in your plan.");
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

/** Takes one search/order from the credit that expires first (free month or a 30-day pack). */
async function consume(uid: string, kind: "search" | "order"): Promise<void> {
  const period = currentPeriod();
  if (supabaseEnabled) {
    const { error } = await supabase().rpc("consume_credit", { p_uid: uid, p_kind: kind, p_period: period });
    if (!error) return;
    if (!/consume_credit/.test(error.message)) throw new Error(`usage: ${error.message}`);
    // Before migration 0004: plain monthly counter.
    const r = await supabase().rpc("add_usage", { p_uid: uid, p_period: period, p_searches: kind === "search" ? 1 : 0, p_orders: kind === "order" ? 1 : 0 });
    if (r.error) throw new Error(`usage: ${r.error.message}`);
    return;
  }
  const k = `${uid}:${period}`;
  const cur = memUsage.get(k) ?? { searches: 0, orders: 0, bonus: 0 };
  const free = freeLimits();
  const freeLeft = kind === "search" ? free.searches + cur.bonus - cur.searches : free.orders - cur.orders;
  const now = Date.now();
  const pack = memPacks
    .filter((p) => p.uid === uid && Date.parse(p.endsAt) > now && (kind === "search" ? p.searchesLeft : p.ordersLeft) > 0)
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))[0];
  if (freeLeft > 0 && (!pack || Date.parse(renewsAt()) <= Date.parse(pack.endsAt))) {
    memUsage.set(k, { ...cur, searches: cur.searches + (kind === "search" ? 1 : 0), orders: cur.orders + (kind === "order" ? 1 : 0) });
  } else if (pack) {
    if (kind === "search") pack.searchesLeft--;
    else pack.ordersLeft--;
  }
}

/** Counts one search (called only after the search returned results). */
export async function recordSearch(uid: string): Promise<Usage> {
  await consume(uid, "search");
  return getUsage(uid);
}

export class OrderQuotaExceeded extends Error {
  status = 402;
  code = "ORDER_QUOTA_EXCEEDED";
  constructor(public usage: Usage) {
    super("You've used all your orders.");
  }
}

/** Throws when the user has no orders left. */
export async function assertCanOrder(uid: string): Promise<Usage> {
  const usage = await getUsage(uid);
  if (usage.ordersUsed >= usage.orderLimit) throw new OrderQuotaExceeded(usage);
  return usage;
}

/** Counts one order. */
export async function recordOrder(uid: string): Promise<Usage> {
  await consume(uid, "order");
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
