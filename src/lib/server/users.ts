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
    // AI needs a plan or an AI top-up: no free AI requests unless FREE_SEARCHES_PER_MONTH says so.
    searches: Math.max(0, Number(process.env.FREE_SEARCHES_PER_MONTH ?? 0) || 0),
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
  email?: string | null;
  country?: string | null;
  lang: Lang;
}
const mem = globalThis as unknown as {
  __dalilUsers?: Map<string, MemUser>;
  __dalilUsage?: Map<string, { searches: number; orders: number; bonus: number }>;
};
const memUsers = (mem.__dalilUsers ??= new Map());
const memUsage = (mem.__dalilUsage ??= new Map());

export async function upsertUser(uid: string, username?: string): Promise<{ country: string | null; lang: Lang; email: string | null }> {
  if (!supabaseEnabled) {
    const cur = memUsers.get(uid);
    const next = { username: username ?? cur?.username, country: cur?.country ?? null, lang: cur?.lang ?? "en", email: cur?.email ?? null };
    memUsers.set(uid, next);
    return { country: next.country, lang: next.lang, email: next.email ?? null };
  }
  // One round trip: upsert and read the saved preferences back.
  const { data, error } = await supabase()
    .from("users")
    .upsert({ pi_uid: uid, ...(username ? { username } : {}), last_seen_at: new Date().toISOString() }, { onConflict: "pi_uid", ignoreDuplicates: false })
    .select("country, lang, email")
    .single();
  if (error) throw new Error(`users: ${error.message}`);
  return { country: (data?.country as string | null) ?? null, lang: (data?.lang as Lang) ?? "en", email: (data?.email as string | null) ?? null };
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
  // One round trip (migration 0006); older schemas fall back to two.
  const one = await supabase().rpc("user_state", { p_uid: uid, p_period: period });
  if (!one.error && one.data) return stateToUsage(one.data as DbState);
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

/** Shape returned by the SQL function public.user_state(). */
interface DbState {
  plan: PlanId;
  searches_quota: number;
  orders_quota: number;
  ends_at: string | null;
  searches_used: number;
  orders_used: number;
  packs?: { id: string; plan: PaidPlanId; searches_quota: number; orders_quota: number; searches_used: number; orders_used: number; starts_at: string; ends_at: string }[];
}

function stateToUsage(st: DbState): Usage {
  return {
    plan: st.plan,
    planEndsAt: st.ends_at,
    period: currentPeriod(),
    renewsAt: renewsAt(),
    searchesUsed: st.searches_used,
    searchLimit: st.searches_quota,
    ordersUsed: st.orders_used,
    orderLimit: st.orders_quota,
    packs: (st.packs ?? []).map((k) => ({
      id: k.id,
      plan: k.plan,
      searchesQuota: k.searches_quota,
      ordersQuota: k.orders_quota,
      searchesLeft: Math.max(0, k.searches_quota - k.searches_used),
      ordersLeft: Math.max(0, k.orders_quota - k.orders_used),
      startsAt: k.starts_at,
      endsAt: k.ends_at,
    })),
  };
}

const isMissingFn = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST202" || /function .* does not exist|Could not find the function/i.test(e.message ?? ""));

/**
 * Verified Pi sign-in only (never dev): if another uid holds this username — the same person's
 * account from the Testnet app, since Pi gives each app its own uid — move that account here.
 */
export async function claimUsername(uid: string, username?: string): Promise<void> {
  if (!username || !supabaseEnabled) return;
  const r = await supabase().rpc("claim_username", { p_uid: uid, p_username: username });
  if (r.error && !isMissingFn(r.error)) throw new Error(`claim: ${r.error.message}`);
}

/** Page load / sign-in: user upsert + saved prefs + credit — one round trip with migration 0006. */
export async function meState(uid: string, username?: string): Promise<{ prefs: { country: string | null; lang: Lang; email: string | null }; usage: Usage }> {
  if (supabaseEnabled) {
    const r = await supabase().rpc("me_state", { p_uid: uid, p_username: username ?? null, p_period: currentPeriod() });
    if (!r.error && r.data) {
      const d = r.data as { country: string | null; lang: Lang | null; email: string | null; state: DbState };
      return { prefs: { country: d.country ?? null, lang: d.lang ?? "en", email: d.email ?? null }, usage: stateToUsage(d.state) };
    }
    if (!isMissingFn(r.error)) throw new Error(`me: ${r.error?.message}`);
  }
  const [prefs, usage] = await Promise.all([upsertUser(uid, username), getUsage(uid)]);
  return { prefs, usage };
}

export class RateLimited extends Error {
  status = 429;
  code = "RATE_LIMITED";
  constructor() {
    super("Too many requests — please slow down and try again shortly.");
  }
}

export class HostedLimit extends Error {
  status = 429;
  code = "HOSTED_LIMIT";
  constructor() {
    super("HOSTED_LIMIT");
  }
}

/**
 * Everything checked before the AI runs, in ONE database call (migration 0006):
 * search quota, per-visitor request rate, per-user hourly limit and the daily AI caps.
 */
export async function beginSearch(uid: string, visitor: string, daily: { perVisitor: number; global: number }): Promise<Usage> {
  const day = new Date().toISOString().slice(0, 10);
  const hour = Math.floor(Date.now() / 3_600_000);
  const win = Math.floor(Date.now() / 600_000);
  const items = [
    { key: `rl:chat:${visitor}:${win}`, ttl: 605, limit: 40, code: "RATE_LIMITED" },
    { key: `search-hour:${uid}:${hour}`, ttl: 3700, limit: HOURLY_SEARCH_LIMIT, code: "HOURLY_LIMIT" },
    { key: `hosted:all:${day}`, ttl: 26 * 3600, limit: daily.global, code: "HOSTED_LIMIT" },
    { key: `hosted:v:${visitor}:${day}`, ttl: 26 * 3600, limit: daily.perVisitor, code: "HOSTED_LIMIT" },
  ];
  let code: string | null = null;
  let usage: Usage | null = null;
  if (supabaseEnabled) {
    const r = await supabase().rpc("begin_search", { p_uid: uid, p_period: currentPeriod(), p_counters: items });
    if (!r.error && r.data) {
      const d = r.data as { ok: boolean; code?: string; state: DbState };
      usage = stateToUsage(d.state);
      code = d.ok ? null : d.code ?? "LIMIT";
    } else if (!isMissingFn(r.error)) {
      throw new Error(`begin_search: ${r.error?.message}`);
    }
  }
  if (!usage) {
    // Local dev / older schema: same checks, several calls.
    usage = await getUsage(uid);
    if (usage.searchesUsed >= usage.searchLimit) code = "QUOTA_EXCEEDED";
    else
      for (const it of items) {
        if ((await counters.incr(it.key, it.ttl)) > it.limit) {
          code = it.code;
          break;
        }
      }
  }
  if (code === "QUOTA_EXCEEDED") throw new QuotaExceeded(usage);
  if (code === "HOURLY_LIMIT") throw new TooFast();
  if (code === "RATE_LIMITED") throw new RateLimited();
  if (code) throw new HostedLimit();
  return usage;
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

/** Takes one credit and returns the fresh usage — one round trip with migration 0006. */
async function spendCredit(uid: string, kind: "search" | "order"): Promise<Usage> {
  if (supabaseEnabled) {
    const r = await supabase().rpc("use_credit", { p_uid: uid, p_kind: kind, p_period: currentPeriod() });
    if (!r.error && r.data) return stateToUsage(r.data as DbState);
    if (!isMissingFn(r.error)) throw new Error(`usage: ${r.error?.message}`);
  }
  await consume(uid, kind);
  return getUsage(uid);
}

/** Counts one search (called only after the search returned results). */
export async function recordSearch(uid: string): Promise<Usage> {
  return spendCredit(uid, "search");
}

/**
 * Takes the AI credit BEFORE the AI runs (one atomic, locked database call), so parallel requests
 * or a closed connection can't get a free answer. Throws QuotaExceeded when no credit is left
 * (then nothing runs); returns a receipt to give the credit back if the server itself fails.
 */
export async function reserveSearch(uid: string): Promise<{ usage: Usage; source: string }> {
  if (supabaseEnabled) {
    const r = await supabase().rpc("use_credit", { p_uid: uid, p_kind: "search", p_period: currentPeriod() });
    if (r.error) throw new Error(`usage: ${r.error.message}`);
    const d = r.data as DbState & { source?: string | null };
    if (!d.source) throw new QuotaExceeded(stateToUsage(d));
    return { usage: stateToUsage(d), source: d.source };
  }
  const before = await getUsage(uid);
  if (before.searchesUsed >= before.searchLimit) throw new QuotaExceeded(before);
  const k = `${uid}:${currentPeriod()}`;
  const cur = memUsage.get(k) ?? { searches: 0, orders: 0, bonus: 0 };
  const packs = memPacks.map((p) => p.searchesLeft);
  await consume(uid, "search");
  const after = memUsage.get(k) ?? cur;
  const pack = memPacks.findIndex((p, i) => p.searchesLeft !== packs[i]);
  return { usage: await getUsage(uid), source: after.searches !== cur.searches ? "free" : pack >= 0 ? `mem:${pack}` : "free" };
}

/** Gives back a reserved credit (the server failed before answering). Never throws. */
export async function refundSearch(uid: string, source: string): Promise<void> {
  try {
    if (supabaseEnabled) {
      await supabase().rpc("refund_credit", { p_uid: uid, p_kind: "search", p_period: currentPeriod(), p_source: source });
      return;
    }
    if (source === "free") {
      const k = `${uid}:${currentPeriod()}`;
      const cur = memUsage.get(k);
      if (cur && cur.searches > 0) memUsage.set(k, { ...cur, searches: cur.searches - 1 });
    } else if (source.startsWith("mem:")) {
      const p = memPacks[Number(source.slice(4))];
      if (p) p.searchesLeft++;
    }
  } catch {
    /* best effort */
  }
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
  return spendCredit(uid, "order");
}

/** Saved profile fields (name/phone/email shown on orders). */
export async function updateProfile(uid: string, p: { displayName?: string | null; phone?: string | null; email?: string | null }): Promise<void> {
  if (!supabaseEnabled) {
    const cur = memUsers.get(uid) ?? { lang: "en" as Lang };
    if (p.email !== undefined) memUsers.set(uid, { ...cur, email: p.email });
    return;
  }
  const patch: Record<string, unknown> = {};
  if (p.displayName !== undefined) patch.display_name = p.displayName;
  if (p.phone !== undefined) patch.phone = p.phone;
  if (p.email !== undefined) patch.email = p.email;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase().from("users").update(patch).eq("pi_uid", uid);
  if (error) throw new Error(`users: ${error.message}`);
}
