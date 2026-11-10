import "server-only";
import { browse, extract } from "./browse";
import { fetchWithTimeout } from "./net";
import { pcmPriceOf } from "./partners";
import { indexedPrice } from "./catalog";
import { verifyOffer } from "./sign";
import { supabase, supabaseEnabled } from "./supabase";
import type { Offer, Watch } from "../types";

/**
 * Watchlist with price-drop alerts. The user saves a product from a card (a
 * server-signed offer, so the starting price is real). A daily cron re-reads
 * the product pages with a plain fetch (no headless browser — cheap on Active
 * CPU) and flags a drop of 2 % or more.
 */
const MAX_PER_USER = 30;
const DROP = 0.98;

export class WatchError extends Error {
  status = 400;
  code = "WATCH_REJECTED";
}

interface Row {
  id: string;
  pi_uid: string;
  url: string;
  title: string;
  store: string;
  image: string | null;
  currency: string;
  price: number | string;
  last_price: number | string;
  last_checked_at: string | null;
  dropped_at: string | null;
  seen_drop: boolean;
  created_at: string;
  target_price?: number | string | null;
  target_hit_at?: string | null;
  notified_at?: string | null;
}
const COLS = "id, url, title, store, image, currency, price, last_price, last_checked_at, dropped_at, seen_drop, created_at, target_price, target_hit_at, notified_at";
const toWatch = (r: Omit<Row, "pi_uid">): Watch => ({
  id: r.id,
  url: r.url,
  title: r.title,
  store: r.store,
  image: r.image ?? undefined,
  currency: r.currency,
  price: Number(r.price),
  lastPrice: Number(r.last_price),
  lastCheckedAt: r.last_checked_at,
  droppedAt: r.dropped_at,
  newDrop: !r.seen_drop,
  targetPrice: r.target_price != null ? Number(r.target_price) : null,
  targetHit: !!r.target_hit_at,
});

const mem = ((globalThis as unknown as { __dalilWatches?: Row[] }).__dalilWatches ??= []);

export async function listWatches(uid: string): Promise<Watch[]> {
  if (!supabaseEnabled) return mem.filter((r) => r.pi_uid === uid).map(toWatch);
  const { data, error } = await supabase().from("watches").select(COLS).eq("pi_uid", uid).order("created_at", { ascending: false }).limit(MAX_PER_USER);
  if (error) throw new Error(`watches: ${error.message}`);
  return (data as Omit<Row, "pi_uid">[]).map(toWatch);
}

/** Set (or clear with null) the price that should trigger an alert. */
export async function setTarget(uid: string, id: string, target: number | null): Promise<void> {
  const patch = { target_price: target, target_hit_at: null };
  if (!supabaseEnabled) {
    const r = mem.find((x) => x.pi_uid === uid && x.id === id);
    if (!r) throw Object.assign(new WatchError("Not found"), { status: 404 });
    Object.assign(r, patch);
    return;
  }
  const { data, error } = await supabase().from("watches").update(patch).eq("pi_uid", uid).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw Object.assign(new WatchError("Not found"), { status: 404 });
}

/** For the Telegram digest: watches with a new drop or a reached target not yet sent. */
export async function pendingWatchAlerts(): Promise<(Watch & { uid: string })[]> {
  const fresh = (r: Row) =>
    (!!r.dropped_at && (!r.notified_at || r.dropped_at > r.notified_at)) || (!!r.target_hit_at && (!r.notified_at || r.target_hit_at > r.notified_at));
  if (!supabaseEnabled) return mem.filter(fresh).map((r) => ({ ...toWatch(r), uid: r.pi_uid }));
  const { data } = await supabase().from("watches").select(`pi_uid, ${COLS}`).or("dropped_at.not.is.null,target_hit_at.not.is.null").limit(2000);
  return ((data ?? []) as Row[]).filter(fresh).map((r) => ({ ...toWatch(r), uid: r.pi_uid }));
}

export async function markWatchesNotified(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const now = new Date().toISOString();
  if (!supabaseEnabled) {
    mem.filter((r) => ids.includes(r.id)).forEach((r) => (r.notified_at = now));
    return;
  }
  await supabase().from("watches").update({ notified_at: now }).in("id", ids);
}

export async function addWatch(uid: string, offer: Offer, targetPrice?: number | null): Promise<Watch> {
  if (!verifyOffer(offer)) throw new WatchError("This offer expired or was changed. Search again.");
  if (!offer.url) throw new WatchError("This offer has no product link.");
  if (offer.flags?.includes("price_unverified")) throw new WatchError("This price wasn't confirmed on the store page.");
  const row = {
    pi_uid: uid,
    url: offer.url,
    title: offer.title.slice(0, 200),
    store: offer.store.slice(0, 100),
    image: offer.image ?? null,
    currency: offer.currency,
    price: offer.price,
    last_price: offer.price,
    seen_drop: true,
    ...(targetPrice && targetPrice > 0 ? { target_price: targetPrice } : {}),
  };
  if (!supabaseEnabled) {
    const mine = mem.filter((r) => r.pi_uid === uid);
    const cur = mine.find((r) => r.url === row.url);
    if (cur) return toWatch(cur);
    if (mine.length >= MAX_PER_USER) throw new WatchError(`You can watch up to ${MAX_PER_USER} products.`);
    const r: Row = { ...row, id: crypto.randomUUID(), last_checked_at: null, dropped_at: null, created_at: new Date().toISOString() };
    mem.unshift(r);
    return toWatch(r);
  }
  const { count } = await supabase().from("watches").select("id", { count: "exact", head: true }).eq("pi_uid", uid);
  if ((count ?? 0) >= MAX_PER_USER) throw new WatchError(`You can watch up to ${MAX_PER_USER} products.`);
  const { data, error } = await supabase().from("watches").upsert(row, { onConflict: "pi_uid,url", ignoreDuplicates: false }).select(COLS).single();
  if (error) throw new Error(`watches: ${error.message}`);
  return toWatch(data as Omit<Row, "pi_uid">);
}

export async function removeWatch(uid: string, id: string): Promise<void> {
  if (!supabaseEnabled) {
    const i = mem.findIndex((r) => r.pi_uid === uid && r.id === id);
    if (i >= 0) mem.splice(i, 1);
    return;
  }
  const { error } = await supabase().from("watches").delete().eq("pi_uid", uid).eq("id", id);
  if (error) throw new Error(`watches: ${error.message}`);
}

/** The user saw the drops (opened the watchlist). */
export async function markDropsSeen(uid: string): Promise<void> {
  if (!supabaseEnabled) {
    mem.filter((r) => r.pi_uid === uid).forEach((r) => (r.seen_drop = true));
    return;
  }
  await supabase().from("watches").update({ seen_drop: true }).eq("pi_uid", uid).eq("seen_drop", false);
}

/** Tests only: read a local mock page. Never on Vercel. */
const allowPrivate = () => !process.env.VERCEL && process.env.DALIL_TEST_ALLOW_PRIVATE_STORES === "1";

async function priceNow(url: string, title?: string): Promise<number | undefined> {
  // Products in Dalil Index: the fresh catalog copy (no page load).
  const known = await indexedPrice(url).catch(() => undefined);
  if (known) return known;
  // Pi Chain Mall pages are an app (no price in the HTML): look the listing up in its search.
  if (/^https:\/\/(www\.)?pipcm\.com\//.test(url)) return pcmPriceOf(url, title ?? "");
  if (allowPrivate() && /^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
    return extract(await res.text(), url).product.price;
  }
  return (await browse(url)).product.price;
}

/** Daily: re-check the least recently checked watches (5 at a time). */
export async function checkWatches(limit = 40): Promise<{ checked: number; drops: number }> {
  let rows: Row[];
  if (!supabaseEnabled) rows = [...mem].sort((a, b) => (a.last_checked_at ?? "").localeCompare(b.last_checked_at ?? "")).slice(0, limit);
  else {
    const { data, error } = await supabase().from("watches").select(`pi_uid, ${COLS}`).order("last_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
    if (error) throw new Error(`watches: ${error.message}`);
    rows = data as Row[];
  }
  let drops = 0;
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(
      rows.slice(i, i + 5).map(async (r) => {
        const p = await priceNow(r.url, r.title).catch(() => undefined);
        const now = new Date().toISOString();
        const patch: Partial<Row> = { last_checked_at: now };
        if (p && p > 0) {
          if (p <= Number(r.last_price) * DROP) {
            Object.assign(patch, { dropped_at: now, seen_drop: false });
            drops++;
          }
          // Reached the user's target price (alert once until the target changes).
          if (r.target_price != null && p <= Number(r.target_price) && !r.target_hit_at) Object.assign(patch, { target_hit_at: now, seen_drop: false });
          patch.last_price = p;
        }
        if (!supabaseEnabled) Object.assign(r, patch);
        else await supabase().from("watches").update(patch).eq("id", r.id);
      }),
    );
  }
  return { checked: rows.length, drops };
}

/**
 * Right after a store's catalog is re-read (Salla: hourly): watched products of that store get
 * their new price from the fresh copy, without a page load. Returns the users with a new drop
 * or a reached target, for an immediate Telegram alert.
 */
export async function applyCatalogPrices(prices: Map<string, number>): Promise<string[]> {
  if (!prices.size) return [];
  let rows: Row[];
  if (!supabaseEnabled) rows = mem.filter((r) => prices.has(r.url));
  else {
    // All watches in one read (a few thousand at most), matched here — not one query per URL.
    const { data, error } = await supabase().from("watches").select(`pi_uid, ${COLS}`).limit(5000);
    if (error) throw new Error(`watches: ${error.message}`);
    rows = ((data ?? []) as Row[]).filter((r) => prices.has(r.url));
  }
  const alerted = new Set<string>();
  const now = new Date().toISOString();
  for (const r of rows) {
    const p = prices.get(r.url)!;
    if (!(p > 0)) continue;
    const patch: Partial<Row> = { last_checked_at: now };
    if (p <= Number(r.last_price) * DROP) {
      Object.assign(patch, { dropped_at: now, seen_drop: false });
      alerted.add(r.pi_uid);
    }
    if (r.target_price != null && p <= Number(r.target_price) && !r.target_hit_at) {
      Object.assign(patch, { target_hit_at: now, seen_drop: false });
      alerted.add(r.pi_uid);
    }
    if (p !== Number(r.last_price)) patch.last_price = p;
    if (!supabaseEnabled) Object.assign(r, patch);
    else await supabase().from("watches").update(patch).eq("id", r.id);
  }
  return [...alerted];
}
