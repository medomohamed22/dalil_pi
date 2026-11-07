import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PushSubscription } from "web-push";
import { browse } from "./browse";
import { channel3Enabled, lookupPrice } from "./channel3";
import { captureAuthorization, createAndAuthorizeWithVault, voidAuthorization } from "./paypal";
import { sendPush } from "./push";
import { prepareOffer } from "./sign";
import { kv } from "./store";
import { HOLD_MINUTES, type Market, type Offer, type Watch, type WatchMode } from "../types";

/**
 * Price watches run server-side so they work while the app is closed.
 *  - notify: price ≤ target → push "Buy now?" → user approves the normal checkout
 *  - auto:   price ≤ target and within mandate → charge the vaulted PayPal wallet
 *            with intent=AUTHORIZE (hold) → push "Bought, cancel within 10 min"
 *            → capture after the window unless the user cancels (void).
 */

interface WatchRecord extends Watch {
  device: string; // sha256(deviceId)
  demoPrice?: number;
  /** The signed offer's price when the watch was created. */
  listPrice?: number;
}

/**
 * Simulated prices (demo random walk, the "simulate drop" button) are never
 * real data, so they may not go further than 15% under the original signed
 * price — otherwise a client could get a validly signed offer at any price.
 */
const MAX_SIMULATED_DROP = 0.15;
function simFloor(r: WatchRecord): number {
  const list = r.listPrice ?? r.history[0]?.price ?? r.lastPrice ?? r.targetPrice;
  return Math.ceil(list * (1 - MAX_SIMULATED_DROP) * 100) / 100;
}

const MAX_WATCHES_PER_DEVICE = 20;
const MIN_CHECK_MS = 4 * 60 * 1000; // throttle live price fetches
const HISTORY_MAX = 60;

export function deviceHash(deviceId: string | null): string {
  if (!deviceId || !/^[a-f0-9]{32,128}$/.test(deviceId)) throw new WatchError("Missing or invalid device id", 401);
  return createHash("sha256").update(deviceId).digest("hex");
}

export class WatchError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "WATCH_ERROR",
  ) {
    super(message);
  }
}

const K = {
  watch: (id: string) => `watch:${id}`,
  all: "watches:all",
  device: (d: string) => `watches:device:${d}`,
  vault: (d: string) => `vault:${d}`,
  push: (d: string) => `push:${d}`,
};

function toPublic(r: WatchRecord): Watch {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { device, demoPrice, listPrice, ...pub } = r;
  return pub;
}

/* ---------------- device-level settings ---------------- */

export async function setVault(device: string, vaultId: string) {
  await kv.set(K.vault(device), { vaultId, savedAt: Date.now() });
}
export async function getVault(device: string): Promise<string | null> {
  return (await kv.get<{ vaultId: string }>(K.vault(device)))?.vaultId ?? null;
}
export async function clearVault(device: string) {
  await kv.del(K.vault(device));
}
export async function setPushSubscription(device: string, sub: PushSubscription | null) {
  if (sub) await kv.set(K.push(device), sub);
  else await kv.del(K.push(device));
}

/** Push a notification to a device's browser (no-op when it never enabled push). */
export async function notifyDevice(device: string, payload: Parameters<typeof sendPush>[1]) {
  return notify(device, payload);
}

async function notify(device: string, payload: Parameters<typeof sendPush>[1]) {
  const sub = await kv.get<PushSubscription>(K.push(device));
  if (!sub) return;
  const alive = await sendPush(sub, payload);
  if (!alive) await kv.del(K.push(device));
}

/* ---------------- CRUD ---------------- */

export async function listWatches(device: string): Promise<Watch[]> {
  const ids = await kv.smembers(K.device(device));
  const recs = await Promise.all(ids.map((id) => kv.get<WatchRecord>(K.watch(id))));
  return recs
    .filter((r): r is WatchRecord => !!r && r.device === device)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toPublic);
}

export async function createWatch(
  device: string,
  input: { offer: Offer; targetPrice: number; mode: WatchMode; maxSpend: number; market: Market; demo: boolean },
): Promise<Watch> {
  const ids = await kv.smembers(K.device(device));
  if (ids.length >= MAX_WATCHES_PER_DEVICE) throw new WatchError("Too many watches", 429, "TOO_MANY");
  const { offer } = input;
  if (offer.trust === "suspicious") throw new WatchError("Can't watch a suspicious store", 403, "SUSPICIOUS");
  if (!(input.targetPrice > 0)) throw new WatchError("Target price must be positive");
  if (input.mode === "auto" && !(await getVault(device))) {
    throw new WatchError("Connect PayPal for auto-buy first", 409, "VAULT_REQUIRED");
  }
  const now = Date.now();
  const rec: WatchRecord = {
    id: randomUUID(),
    device,
    title: offer.title,
    store: offer.store,
    url: offer.url,
    image: offer.image,
    currency: offer.currency,
    market: input.market,
    shipping: offer.shipping ?? 0,
    trust: offer.trust,
    targetPrice: Math.round(input.targetPrice * 100) / 100,
    mode: input.mode,
    maxSpend: Math.max(0, input.maxSpend),
    source: input.demo ? "demo" : "live",
    status: "active",
    lastPrice: offer.price,
    history: [{ t: now, price: offer.price }],
    createdAt: now,
    lastCheckedAt: now,
    demoPrice: input.demo ? offer.price : undefined,
    listPrice: offer.price,
  };
  await kv.set(K.watch(rec.id), rec);
  await kv.sadd(K.device(device), rec.id);
  await kv.sadd(K.all, rec.id);
  return toPublic(rec);
}

async function load(device: string, id: string): Promise<WatchRecord> {
  const r = await kv.get<WatchRecord>(K.watch(id));
  if (!r || r.device !== device) throw new WatchError("Watch not found", 404, "NOT_FOUND");
  return r;
}

async function save(r: WatchRecord) {
  await kv.set(K.watch(r.id), r);
}

export async function deleteWatch(device: string, id: string) {
  const r = await load(device, id);
  if (r.status === "held" && r.hold) {
    await voidAuthorization(r.hold.authorizationId).catch(() => undefined);
  }
  await kv.del(K.watch(id));
  await kv.srem(K.device(device), id);
  await kv.srem(K.all, id);
}

/* ---------------- price checks & triggers ---------------- */

async function currentPrice(r: WatchRecord): Promise<number | null> {
  if (r.source === "demo") {
    // Gentle random walk around the last price for demo watches.
    const base = r.demoPrice ?? r.lastPrice ?? r.targetPrice * 1.1;
    const drift = 1 + (Math.random() - 0.55) * 0.01;
    const p = Math.max(simFloor(r), Math.round(base * drift * 100) / 100);
    r.demoPrice = p;
    return p;
  }
  if (!r.url) return null;
  return fetchLivePrice(r.url, r.currency);
}

/** Live price of a product page (Channel3 for US, otherwise the store page itself). */
export async function fetchLivePrice(url: string, currency: string): Promise<number | null> {
  // US products: Channel3 returns the live price even for sites that block scrapers.
  if (channel3Enabled() && currency.toUpperCase() === "USD") {
    try {
      const hit = await lookupPrice(url);
      if (hit && hit.currency.toUpperCase() === "USD") return hit.price;
    } catch {
      /* fall back to browsing */
    }
  }
  const page = await browse(url);
  const p = page.product.price;
  if (p == null || !(p > 0)) return null;
  if (page.product.currency && page.product.currency.toUpperCase() !== currency.toUpperCase()) return null;
  return p;
}

function offerAt(r: WatchRecord, price: number): Offer {
  return prepareOffer({
    id: `w_${r.id.slice(0, 8)}_${Date.now().toString(36)}`,
    title: r.title,
    image: r.image,
    url: r.url,
    store: r.store,
    price,
    currency: r.currency,
    shipping: r.shipping,
    total: Math.round((price + r.shipping) * 100) / 100,
    trust: r.trust,
    flags: [],
    badges: [],
  });
}

const money = (v: number, c: string) => `${v.toLocaleString("en-US")} ${c}`;

async function evaluate(r: WatchRecord, price: number | null): Promise<void> {
  const now = Date.now();
  r.lastCheckedAt = now;
  if (price != null) {
    r.lastPrice = price;
    r.history = [...r.history, { t: now, price }].slice(-HISTORY_MAX);
  }

  if (r.status === "active" && price != null && price <= r.targetPrice) {
    const offer = offerAt(r, price);
    const withinMandate = r.maxSpend <= 0 || offer.total <= r.maxSpend;

    if (r.mode === "auto" && withinMandate) {
      const vaultId = await getVault(r.device);
      if (vaultId) {
        try {
          const a = await createAndAuthorizeWithVault({
            referenceId: offer.id,
            title: r.title,
            store: r.store,
            url: r.url,
            imageUrl: r.image,
            price,
            shipping: r.shipping,
            currency: r.currency,
            vaultId,
          });
          r.status = "held";
          r.triggeredOffer = offer;
          r.hold = {
            orderId: a.orderId,
            authorizationId: a.authorizationId,
            captureAt: now + HOLD_MINUTES * 60_000,
            amount: a.amount.value,
            currency: a.amount.currency,
            shipping: a.shipping,
          };
          r.message = undefined;
          await notify(r.device, {
            title: `Dalil bought it: ${r.title}`.slice(0, 80),
            body: `${money(offer.total, r.currency)} at ${r.store} — funds HELD. Cancel within ${HOLD_MINUTES} min.`,
            url: `/?watch=${r.id}`,
            tag: `watch-${r.id}`,
            image: r.image,
          });
          return;
        } catch (e) {
          r.message = `Auto-buy failed: ${(e as Error).message}`.slice(0, 200);
          // fall through to notify mode
        }
      } else {
        r.message = "Auto-buy needs PayPal connected — switched to notify.";
      }
    } else if (r.mode === "auto" && !withinMandate) {
      r.message = `Above your limit (${money(r.maxSpend, r.currency)}) — not bought.`;
    }

    r.status = "triggered";
    r.triggeredOffer = offer;
    await notify(r.device, {
      title: `Price drop: ${r.title}`.slice(0, 80),
      body: `${money(offer.total, r.currency)} at ${r.store} (target ${money(r.targetPrice, r.currency)}). Tap to buy.`,
      url: `/?watch=${r.id}`,
      tag: `watch-${r.id}`,
      image: r.image,
    });
    return;
  }

  // Auto-buy cancel window elapsed → capture.
  if (r.status === "held" && r.hold && r.hold.captureAt <= now) {
    try {
      const c = await captureAuthorization(r.hold.authorizationId);
      r.status = "bought";
      r.captureId = c.id;
      r.message = undefined;
      await notify(r.device, {
        title: `Purchase confirmed: ${r.title}`.slice(0, 80),
        body: `Paid ${r.hold.amount} ${r.hold.currency} via PayPal.`,
        url: `/?watch=${r.id}`,
        tag: `watch-${r.id}`,
      });
    } catch (e) {
      r.status = "error";
      r.message = `Capture failed: ${(e as Error).message}`.slice(0, 200);
    }
  }
}

export async function checkWatch(r: WatchRecord, force = false): Promise<WatchRecord> {
  const due = force || !r.lastCheckedAt || Date.now() - r.lastCheckedAt >= MIN_CHECK_MS || r.source === "demo";
  if (r.status === "active" && due) {
    let price: number | null = null;
    try {
      price = await currentPrice(r);
    } catch (e) {
      r.message = `Price check failed: ${(e as Error).message}`.slice(0, 160);
    }
    await evaluate(r, price);
  } else if (r.status === "held") {
    await evaluate(r, null);
  }
  await save(r);
  return r;
}

/** Check all of one device's watches (called by the open app). */
export async function syncDevice(device: string): Promise<Watch[]> {
  const ids = await kv.smembers(K.device(device));
  for (const id of ids) {
    const r = await kv.get<WatchRecord>(K.watch(id));
    if (r && r.device === device && (r.status === "active" || r.status === "held")) await checkWatch(r);
  }
  return listWatches(device);
}

/** Cron: check every active/held watch. */
export async function runAll(limit = 200): Promise<{ checked: number; triggered: number; bought: number }> {
  const ids = (await kv.smembers(K.all)).slice(0, limit);
  let checked = 0;
  let triggered = 0;
  let bought = 0;
  for (const id of ids) {
    const r = await kv.get<WatchRecord>(K.watch(id));
    if (!r) {
      await kv.srem(K.all, id);
      continue;
    }
    if (r.status !== "active" && r.status !== "held") continue;
    const before = r.status;
    await checkWatch(r);
    checked++;
    const after = r.status as Watch["status"];
    if (before === "active" && (after === "triggered" || after === "held")) triggered++;
    if (after === "bought" && before === "held") bought++;
  }
  return { checked, triggered, bought };
}

/* ---------------- user actions ---------------- */

export async function watchAction(
  device: string,
  id: string,
  action: "simulate" | "check" | "cancel" | "capture" | "reactivate" | "purchased",
  params: { price?: number } = {},
): Promise<Watch> {
  const r = await load(device, id);
  switch (action) {
    case "simulate": {
      // Demo helper: make the price fall just under the target. Sandbox (play money) only.
      if (process.env.PAYPAL_ENV === "live" && r.source !== "demo") {
        throw new WatchError("Simulated price drops are only available on the PayPal sandbox", 403, "SANDBOX_ONLY");
      }
      if (r.status !== "active") throw new WatchError("Watch is not active", 409);
      // The client may suggest a price, but never below the simulation floor.
      const want = params.price && params.price > 0 ? Math.min(params.price, r.targetPrice) : Math.floor(r.targetPrice * 0.97 * 100) / 100;
      const p = Math.max(simFloor(r), want);
      if (p > r.targetPrice) {
        throw new WatchError("A simulated drop can go at most 15% under the original price — raise the target to try it.", 409, "SIMULATION_LIMIT");
      }
      r.demoPrice = p;
      await evaluate(r, p);
      break;
    }
    case "check":
      await checkWatch(r, true);
      return toPublic(r);
    case "cancel": {
      if (r.status !== "held" || !r.hold) throw new WatchError("Nothing to cancel", 409);
      await voidAuthorization(r.hold.authorizationId);
      r.status = "cancelled";
      r.message = "Cancelled — hold released.";
      break;
    }
    case "capture": {
      if (r.status !== "held" || !r.hold) throw new WatchError("Nothing to confirm", 409);
      r.hold.captureAt = 0;
      await evaluate(r, null);
      break;
    }
    case "purchased": {
      // The user bought the triggered offer through the normal approval flow.
      if (r.status !== "triggered") throw new WatchError("Watch was not triggered", 409);
      r.status = "bought";
      r.message = undefined;
      break;
    }
    case "reactivate": {
      r.status = "active";
      r.triggeredOffer = undefined;
      r.hold = undefined;
      r.message = undefined;
      break;
    }
  }
  await save(r);
  return toPublic(r);
}
