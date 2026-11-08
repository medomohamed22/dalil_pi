import "server-only";
import { normUrl } from "./evidence";
import { listOrders } from "./orders";
import { supabase, supabaseEnabled } from "./supabase";
import type { Offer, PriceStats, ShopQuestion } from "../types";

/**
 * Community data that makes Dalil Pi smarter over time:
 *  - price history (every confirmed price, one row per product per day),
 *  - reviews from Dalil Pi buyers and problems they report (feed the trust score),
 *  - questions to registered merchants ("Ask the shop").
 * Each has an in-memory twin for local development.
 */
type Mem = {
  prices: { url_key: string; day: string; price: number; currency: string; title?: string; store?: string; url?: string; image?: string; country?: string }[];
  reviews: { id: string; pi_uid: string; order_id: string; store_domain: string | null; store_name: string; rating: number; comment: string | null; created_at: string }[];
  disputes: { id: string; pi_uid: string; order_id: string; store_domain: string | null; store_name: string; kind: string; details: string | null; status: string; created_at: string }[];
  questions: { id: string; merchant_id: string; pi_uid: string; question: string; answer: string | null; answered_at: string | null; notified_at: string | null; created_at: string; merchant_name?: string }[];
};
const mem = ((globalThis as unknown as { __dalilCommunity?: Mem }).__dalilCommunity ??= { prices: [], reviews: [], disputes: [], questions: [] });
const today = () => new Date().toISOString().slice(0, 10);
export class CommunityError extends Error {
  status = 400;
  code = "REJECTED";
}

/* ---------------- price history ---------------- */

/** Records the confirmed prices of shown offers (best effort, never throws). */
export async function recordPrices(offers: Offer[], country: string): Promise<void> {
  const rows = offers
    .filter((o) => o.url && o.price > 0 && !o.flags.includes("price_unverified") && o.trust !== "suspicious")
    .map((o) => ({ url_key: normUrl(o.url!)!, day: today(), price: o.price, currency: o.currency, title: o.title.slice(0, 160), store: o.store.slice(0, 100), url: o.url, image: o.image ?? null, country }))
    .filter((r) => r.url_key);
  if (!rows.length) return;
  try {
    if (!supabaseEnabled) {
      for (const r of rows) {
        const i = mem.prices.findIndex((x) => x.url_key === r.url_key && x.day === r.day);
        if (i >= 0) mem.prices[i] = { ...mem.prices[i], ...r, image: r.image ?? undefined };
        else mem.prices.push({ ...r, image: r.image ?? undefined });
      }
      return;
    }
    await supabase().from("price_history").upsert(rows, { onConflict: "url_key,day" });
  } catch {
    /* history is a bonus — never fail a search for it */
  }
}

/** Test hook (local only): add an older price point. */
export function memAddPricePoint(p: Mem["prices"][number]) {
  mem.prices.push(p);
}

/** 90-day price stats per product URL for the given offers. */
export async function priceStats(urls: string[]): Promise<Map<string, PriceStats>> {
  const keys = [...new Set(urls.map((u) => normUrl(u)).filter(Boolean) as string[])].slice(0, 30);
  const out = new Map<string, PriceStats>();
  if (!keys.length) return out;
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  let rows: { url_key: string; day: string; price: number | string }[] = [];
  try {
    if (!supabaseEnabled) rows = mem.prices.filter((r) => keys.includes(r.url_key) && r.day >= since);
    else {
      const { data } = await supabase().from("price_history").select("url_key, day, price").in("url_key", keys).gte("day", since).order("day", { ascending: true }).limit(2000);
      rows = data ?? [];
    }
  } catch {
    return out;
  }
  for (const k of keys) {
    const pts = rows.filter((r) => r.url_key === k).sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, price: Number(r.price) }));
    if (!pts.length) continue;
    const prices = pts.map((p) => p.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    out.set(k, { points: pts.slice(-30), min: Math.min(...prices), max: Math.max(...prices), avg: Math.round(avg * 100) / 100, days: pts.length });
  }
  return out;
}

/** Biggest recent price drops in a country (for "Today's deals"). */
export async function todaysDeals(country: string, limit = 8): Promise<{ title: string; store: string; url: string; image?: string; price: number; was: number; currency: string; dropPct: number }[]> {
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  let rows: Mem["prices"] = [];
  try {
    if (!supabaseEnabled) rows = mem.prices.filter((r) => r.country === country && r.day >= since);
    else {
      const { data } = await supabase().from("price_history").select("url_key, day, price, currency, title, store, url, image, country").eq("country", country).gte("day", since).limit(3000);
      rows = (data ?? []).map((r) => ({ ...r, price: Number(r.price) })) as Mem["prices"];
    }
  } catch {
    return [];
  }
  const by = new Map<string, Mem["prices"]>();
  for (const r of rows) by.set(r.url_key, [...(by.get(r.url_key) ?? []), r]);
  const deals = [];
  for (const pts of by.values()) {
    if (pts.length < 2) continue;
    pts.sort((a, b) => a.day.localeCompare(b.day));
    const last = pts.at(-1)!;
    const was = Math.max(...pts.slice(0, -1).map((p) => p.price));
    const dropPct = Math.round((1 - last.price / was) * 100);
    if (dropPct >= 5 && last.url) deals.push({ title: last.title ?? "", store: last.store ?? "", url: last.url, image: last.image, price: last.price, was, currency: last.currency, dropPct });
  }
  return deals.sort((a, b) => b.dropPct - a.dropPct).slice(0, limit);
}

/* ---------------- reviews & disputes ---------------- */

async function ownOrder(uid: string, orderId: string) {
  const o = (await listOrders(uid, 500)).find((x) => x.id === orderId);
  if (!o) throw Object.assign(new CommunityError("Order not found"), { status: 404 });
  return o;
}

export async function addReview(uid: string, orderId: string, rating: number, comment?: string | null) {
  const o = await ownOrder(uid, orderId);
  if (!["delivered", "paid", "shipped"].includes(o.status)) throw new CommunityError("You can review a store after you paid for the order.");
  const row = { pi_uid: uid, order_id: o.id, store_domain: o.storeDomain ?? null, store_name: o.storeName, rating, comment: comment?.trim().slice(0, 500) || null };
  if (!supabaseEnabled) {
    if (mem.reviews.some((r) => r.order_id === o.id)) throw new CommunityError("You already reviewed this order.");
    mem.reviews.push({ ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    return;
  }
  const { error } = await supabase().from("store_reviews").insert(row);
  if (error) throw new CommunityError(/duplicate/.test(error.message) ? "You already reviewed this order." : error.message);
}

export async function addDispute(uid: string, orderId: string, kind: string, details?: string | null) {
  const o = await ownOrder(uid, orderId);
  const row = { pi_uid: uid, order_id: o.id, store_domain: o.storeDomain ?? null, store_name: o.storeName, kind, details: details?.trim().slice(0, 1000) || null };
  if (!supabaseEnabled) {
    if (mem.disputes.some((r) => r.order_id === o.id)) throw new CommunityError("You already reported this order.");
    mem.disputes.push({ ...row, id: crypto.randomUUID(), status: "open", created_at: new Date().toISOString() });
    return;
  }
  const { error } = await supabase().from("disputes").insert(row);
  if (error) throw new CommunityError(/duplicate/.test(error.message) ? "You already reported this order." : error.message);
}

/** Which orders the user already reviewed / reported. */
export async function myOrderFeedback(uid: string): Promise<{ reviewed: string[]; reported: string[] }> {
  if (!supabaseEnabled) return { reviewed: mem.reviews.filter((r) => r.pi_uid === uid).map((r) => r.order_id), reported: mem.disputes.filter((r) => r.pi_uid === uid).map((r) => r.order_id) };
  const [a, b] = await Promise.all([supabase().from("store_reviews").select("order_id").eq("pi_uid", uid).limit(500), supabase().from("disputes").select("order_id").eq("pi_uid", uid).limit(500)]);
  return { reviewed: (a.data ?? []).map((r) => r.order_id), reported: (b.data ?? []).map((r) => r.order_id) };
}

export interface StoreSignals {
  reviews: number;
  avg: number | null;
  disputes: number;
}

/** Dalil Pi buyer reviews and reported problems per store (by domain, else by name). */
export async function storeSignals(stores: { domain?: string; name: string }[]): Promise<Map<string, StoreSignals>> {
  const out = new Map<string, StoreSignals>();
  const domains = [...new Set(stores.map((s) => s.domain).filter(Boolean) as string[])];
  const names = [...new Set(stores.filter((s) => !s.domain).map((s) => s.name.toLowerCase()))];
  if (!domains.length && !names.length) return out;
  let revs: { store_domain: string | null; store_name: string; rating: number }[] = [];
  let disp: { store_domain: string | null; store_name: string; status: string }[] = [];
  try {
    if (!supabaseEnabled) {
      revs = mem.reviews;
      disp = mem.disputes;
    } else {
      const or = [domains.length ? `store_domain.in.(${domains.map((d) => `"${d}"`).join(",")})` : "", ...names.slice(0, 10).map((n) => `store_name.ilike.${n.replace(/[,()*%]/g, "")}`)].filter(Boolean).join(",");
      const [a, b] = await Promise.all([
        supabase().from("store_reviews").select("store_domain, store_name, rating").or(or).limit(2000),
        supabase().from("disputes").select("store_domain, store_name, status").or(or).neq("status", "rejected").limit(2000),
      ]);
      revs = a.data ?? [];
      disp = b.data ?? [];
    }
  } catch {
    return out;
  }
  for (const s of stores) {
    const key = s.domain ?? s.name.toLowerCase();
    const hit = (r: { store_domain: string | null; store_name: string }) => (s.domain ? r.store_domain === s.domain : r.store_name.toLowerCase() === s.name.toLowerCase());
    const rs = revs.filter(hit);
    const ds = disp.filter((d) => hit(d) && (d as { status?: string }).status !== "rejected");
    out.set(key, { reviews: rs.length, avg: rs.length ? Math.round((rs.reduce((a, r) => a + Number(r.rating), 0) / rs.length) * 10) / 10 : null, disputes: ds.length });
  }
  return out;
}

/* ---------------- Ask the shop ---------------- */

export async function askShop(uid: string, merchantId: string, question: string): Promise<void> {
  const q = question.trim().slice(0, 500);
  if (q.length < 3) throw new CommunityError("Write your question.");
  if (!supabaseEnabled) {
    mem.questions.push({ id: crypto.randomUUID(), merchant_id: merchantId, pi_uid: uid, question: q, answer: null, answered_at: null, notified_at: null, created_at: new Date().toISOString() });
    return;
  }
  const { data: m } = await supabase().from("merchants").select("id").eq("id", merchantId).eq("status", "approved").maybeSingle();
  if (!m) throw Object.assign(new CommunityError("Shop not found"), { status: 404 });
  const { count } = await supabase().from("shop_questions").select("id", { count: "exact", head: true }).eq("pi_uid", uid).gte("created_at", new Date(Date.now() - 864e5).toISOString());
  if ((count ?? 0) >= 20) throw Object.assign(new CommunityError("Too many questions today."), { status: 429 });
  const { error } = await supabase().from("shop_questions").insert({ merchant_id: merchantId, pi_uid: uid, question: q });
  if (error) throw new Error(error.message);
}

/** Questions I asked (with answers). */
export async function myQuestions(uid: string): Promise<ShopQuestion[]> {
  if (!supabaseEnabled) {
    const { getMerchantName } = await import("./merchants");
    return Promise.all(
      mem.questions.filter((q) => q.pi_uid === uid).map(async (q) => ({ id: q.id, shop: (await getMerchantName(q.merchant_id)) ?? "", question: q.question, answer: q.answer, answeredAt: q.answered_at, createdAt: q.created_at })),
    );
  }
  const { data } = await supabase().from("shop_questions").select("id, question, answer, answered_at, created_at, merchants(name)").eq("pi_uid", uid).order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((q) => ({ id: q.id, shop: (q.merchants as unknown as { name?: string } | null)?.name ?? "", question: q.question, answer: q.answer, answeredAt: q.answered_at, createdAt: q.created_at }));
}

/** Questions to my shop (merchant inbox). */
export async function inbox(merchantId: string): Promise<ShopQuestion[]> {
  if (!supabaseEnabled) return mem.questions.filter((q) => q.merchant_id === merchantId).map((q) => ({ id: q.id, shop: "", question: q.question, answer: q.answer, answeredAt: q.answered_at, createdAt: q.created_at }));
  const { data } = await supabase().from("shop_questions").select("id, question, answer, answered_at, created_at").eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((q) => ({ id: q.id, shop: "", question: q.question, answer: q.answer, answeredAt: q.answered_at, createdAt: q.created_at }));
}

export async function answerQuestion(merchantId: string, questionId: string, answer: string): Promise<void> {
  const a = answer.trim().slice(0, 800);
  if (!a) throw new CommunityError("Write an answer.");
  if (!supabaseEnabled) {
    const q = mem.questions.find((x) => x.id === questionId && x.merchant_id === merchantId);
    if (!q) throw Object.assign(new CommunityError("Question not found"), { status: 404 });
    Object.assign(q, { answer: a, answered_at: new Date().toISOString(), notified_at: null });
    return;
  }
  const { data, error } = await supabase().from("shop_questions").update({ answer: a, answered_at: new Date().toISOString(), notified_at: null }).eq("id", questionId).eq("merchant_id", merchantId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw Object.assign(new CommunityError("Question not found"), { status: 404 });
}

/** For the daily digest: answered questions not yet sent, grouped by asker. */
export async function pendingAnswers(): Promise<{ id: string; pi_uid: string; question: string; answer: string; shop: string }[]> {
  if (!supabaseEnabled) {
    const { getMerchantName } = await import("./merchants");
    return Promise.all(mem.questions.filter((q) => q.answer && !q.notified_at).map(async (q) => ({ id: q.id, pi_uid: q.pi_uid, question: q.question, answer: q.answer!, shop: (await getMerchantName(q.merchant_id)) ?? "" })));
  }
  const { data } = await supabase().from("shop_questions").select("id, pi_uid, question, answer, merchants(name)").not("answer", "is", null).is("notified_at", null).limit(500);
  return (data ?? []).map((q) => ({ id: q.id, pi_uid: q.pi_uid, question: q.question, answer: q.answer as string, shop: (q.merchants as unknown as { name?: string } | null)?.name ?? "" }));
}

export async function markAnswersNotified(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (!supabaseEnabled) {
    mem.questions.filter((q) => ids.includes(q.id)).forEach((q) => (q.notified_at = new Date().toISOString()));
    return;
  }
  await supabase().from("shop_questions").update({ notified_at: new Date().toISOString() }).in("id", ids);
}
