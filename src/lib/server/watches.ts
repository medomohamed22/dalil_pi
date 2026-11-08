import "server-only";
import { browse, extract } from "./browse";
import { fetchWithTimeout } from "./net";
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
}
const COLS = "id, url, title, store, image, currency, price, last_price, last_checked_at, dropped_at, seen_drop, created_at";
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
});

const mem = ((globalThis as unknown as { __dalilWatches?: Row[] }).__dalilWatches ??= []);

export async function listWatches(uid: string): Promise<Watch[]> {
  if (!supabaseEnabled) return mem.filter((r) => r.pi_uid === uid).map(toWatch);
  const { data, error } = await supabase().from("watches").select(COLS).eq("pi_uid", uid).order("created_at", { ascending: false }).limit(MAX_PER_USER);
  if (error) throw new Error(`watches: ${error.message}`);
  return (data as Omit<Row, "pi_uid">[]).map(toWatch);
}

export async function addWatch(uid: string, offer: Offer): Promise<Watch> {
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

async function priceNow(url: string): Promise<number | undefined> {
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
        const p = await priceNow(r.url).catch(() => undefined);
        const now = new Date().toISOString();
        const patch: Partial<Row> = { last_checked_at: now };
        if (p && p > 0) {
          if (p <= Number(r.last_price) * DROP) {
            Object.assign(patch, { dropped_at: now, seen_drop: false });
            drops++;
          }
          patch.last_price = p;
        }
        if (!supabaseEnabled) Object.assign(r, patch);
        else await supabase().from("watches").update(patch).eq("id", r.id);
      }),
    );
  }
  return { checked: rows.length, drops };
}
