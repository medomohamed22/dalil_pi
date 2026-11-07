import "server-only";
import { randomUUID } from "node:crypto";
import { getCapture, getOrderReferenceIds, PayPalError, refundCapture } from "./paypal";
import { kv, storePersistent } from "./store";
import { fetchLivePrice, notifyDevice, WatchError } from "./watches";
import { PROTECTION_DAYS, type Offer, type Protection } from "../types";

/**
 * Price protection after the purchase: for PROTECTION_DAYS after a captured
 * purchase Dalil keeps checking the price. If it drops, Dalil refunds the
 * difference to the buyer with a PARTIAL refund on the original PayPal capture
 * (Payments v2 /captures/{id}/refund with an amount) — no claim, no form.
 *
 * Guarantees, all enforced here in server code:
 *  - only the browser that captured the payment can protect it (capture token),
 *  - the protected price is the signed offer that PayPal actually charged
 *    (the capture amount is read back from PayPal and must match),
 *  - each refund is the drop since the lowest price already refunded, never
 *    more than what is left on the capture, and idempotent per price level,
 *  - simulated drops (for demos) only exist on the PayPal sandbox and can't go
 *    more than 15% under the price paid.
 */

interface ProtectionRecord extends Protection {
  device: string; // sha256(deviceId)
  /** Lowest price already refunded against (starts at the price paid). */
  floorPrice: number;
}

const DAY = 24 * 3600_000;
const MIN_LIVE_CHECK_MS = 60 * 60_000;
const HISTORY_MAX = 60;
const MAX_SIMULATED_DROP = 0.15;
const MAX_PER_DEVICE = 50;
/**
 * A live "price" more than this far under the price paid is far more likely a
 * misread page (a monthly plan, an accessory, a coupon) than a real drop — so it
 * is recorded but never refunded automatically.
 */
const MAX_LIVE_DROP = 0.5;

const K = {
  rec: (id: string) => `protect:${id}`,
  byCapture: (captureId: string) => `protect:cap:${captureId}`,
  device: (d: string) => `protect:device:${d}`,
  all: "protect:all",
  lock: (id: string) => `protect:${id}:lock`,
};

const sandbox = () => process.env.PAYPAL_ENV !== "live";

function toPublic(r: ProtectionRecord): Protection {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { device, floorPrice, ...pub } = r;
  return pub;
}

async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 40; i++) {
    if (await kv.setnx(K.lock(id), 30)) {
      try {
        return await fn();
      } finally {
        await kv.del(K.lock(id)).catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new WatchError("Busy — try again in a moment", 503, "BUSY");
}

const save = (r: ProtectionRecord) => kv.set(K.rec(r.id), r);

/** Money in the charge currency, rounded DOWN to the cent so we never over-refund. */
function toChargeDown(amountInOfferCurrency: number, r: ProtectionRecord): number {
  const v = r.charged.currency !== r.currency && r.fxRate ? amountInOfferCurrency / r.fxRate : amountInOfferCurrency;
  return Math.floor(v * 100 + 1e-6) / 100;
}

export async function createProtection(
  device: string,
  input: { captureId: string; orderId: string; offer: Offer; demo: boolean },
): Promise<Protection> {
  if (!storePersistent && process.env.VERCEL) {
    throw new WatchError("Price protection needs the shared database (Upstash Redis), which isn't connected on this deployment yet.", 503, "STORAGE_NOT_CONFIGURED");
  }
  const { offer, captureId } = input;
  const existingId = await kv.get<string>(K.byCapture(captureId));
  if (existingId) {
    const r = await kv.get<ProtectionRecord>(K.rec(existingId));
    if (r && r.device === device) return toPublic(r);
    if (r) throw new WatchError("This purchase is already protected on another device", 409, "ALREADY_PROTECTED");
  }
  if ((await kv.smembers(K.device(device))).length >= MAX_PER_DEVICE) throw new WatchError("Too many protected purchases", 429, "TOO_MANY");

  // The capture PayPal actually made must be this signed offer's charge.
  // ...and the order that was captured must be the order for THIS signed offer,
  // so a different (or attacker-hosted) product page can't be swapped in afterwards.
  const refs = await getOrderReferenceIds(input.orderId);
  if (!refs.includes(offer.id)) throw new WatchError("This offer isn't the one that was paid for", 409, "OFFER_MISMATCH");
  const cap = await getCapture(captureId);
  if (cap.status !== "COMPLETED") throw new WatchError(`This payment is ${cap.status.toLowerCase()} — nothing to protect`, 409, "CAPTURE_NOT_COMPLETED");
  const expected = offer.chargeAmount ?? offer.total;
  const expectedCur = offer.chargeCurrency ?? offer.currency;
  if (cap.currency !== expectedCur || Math.abs(Number(cap.amount) - expected) > 0.02) {
    throw new WatchError("The captured amount doesn't match this offer", 409, "CAPTURE_MISMATCH");
  }

  const now = Date.now();
  const r: ProtectionRecord = {
    id: randomUUID(),
    device,
    captureId,
    orderId: input.orderId,
    title: offer.title,
    store: offer.store,
    url: offer.url,
    image: offer.image,
    currency: offer.currency,
    paidPrice: offer.price,
    shipping: offer.shipping ?? 0,
    charged: { value: cap.amount, currency: cap.currency },
    fxRate: offer.fxRate,
    source: input.demo ? "demo" : "live",
    status: "active",
    createdAt: now,
    until: now + PROTECTION_DAYS * DAY,
    lastPrice: offer.price,
    lastCheckedAt: now,
    history: [{ t: now, price: offer.price }],
    refunds: [],
    refundedTotal: "0.00",
    floorPrice: offer.price,
  };
  await save(r);
  await kv.set(K.byCapture(captureId), r.id);
  await kv.sadd(K.device(device), r.id);
  await kv.sadd(K.all, r.id);
  return toPublic(r);
}

async function load(device: string, id: string): Promise<ProtectionRecord> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new WatchError("Not found", 404, "NOT_FOUND");
  const r = await kv.get<ProtectionRecord>(K.rec(id));
  if (!r || r.device !== device) throw new WatchError("Not found", 404, "NOT_FOUND");
  return r;
}

/** New price observed → refund the drop (if any) as a partial refund on the capture. */
async function observe(r: ProtectionRecord, price: number, simulated: boolean): Promise<void> {
  const now = Date.now();
  r.lastPrice = price;
  r.lastCheckedAt = now;
  r.history = [...r.history, { t: now, price }].slice(-HISTORY_MAX);
  if (r.status !== "active" || !(price < r.floorPrice)) return;

  const left = Math.round((Number(r.charged.value) - Number(r.refundedTotal)) * 100) / 100;
  const amount = Math.min(toChargeDown(r.floorPrice - price, r), left);
  if (!(amount >= 0.01)) return;
  const value = amount.toFixed(2);
  try {
    const ref = await refundCapture(
      r.captureId,
      `Dalil price protection: the price dropped to ${price} ${r.currency}, so the difference is refunded.`,
      { value, currency: r.charged.currency, key: `p${Math.round(price * 100)}` },
    );
    r.refunds.push({ id: ref.id, status: ref.status, amount: value, currency: r.charged.currency, price, at: now, simulated });
    r.refundedTotal = (Number(r.refundedTotal) + amount).toFixed(2);
    r.floorPrice = price;
    r.message = undefined;
    if (Number(r.refundedTotal) >= Number(r.charged.value) - 0.005) r.status = "ended";
    await notifyDevice(r.device, {
      title: `Price dropped — Dalil refunded ${value} ${r.charged.currency}`.slice(0, 80),
      body: `${r.title} is now ${price.toLocaleString("en-US")} ${r.currency} at ${r.store}. The difference is back in your PayPal.`.slice(0, 180),
      url: "/",
      tag: `protect-${r.id}`,
      image: r.image,
    }).catch(() => undefined);
  } catch (e) {
    // A fully refunded capture (e.g. an order-problem refund) can't be refunded again.
    if (e instanceof PayPalError && /REFUND|CAPTURE_FULLY_REFUNDED|ALREADY/i.test(e.code)) r.status = "ended";
    r.message = `Refund failed: ${(e as Error).message}`.slice(0, 200);
  }
}

async function check(r: ProtectionRecord, force = false): Promise<ProtectionRecord> {
  if (r.status === "active" && Date.now() > r.until) {
    r.status = "expired";
    await kv.srem(K.all, r.id);
  }
  if (r.status === "active" && r.source === "live" && r.url) {
    const due = force || !r.lastCheckedAt || Date.now() - r.lastCheckedAt >= MIN_LIVE_CHECK_MS;
    if (due) {
      try {
        const p = await fetchLivePrice(r.url, r.currency);
        if (p != null && p < r.paidPrice * (1 - MAX_LIVE_DROP)) {
          r.lastCheckedAt = Date.now();
          r.message = `Ignored an implausible price (${p} ${r.currency}) — needs a manual check.`;
        } else if (p != null) await observe(r, p, false);
        else r.lastCheckedAt = Date.now();
      } catch (e) {
        r.lastCheckedAt = Date.now();
        r.message = `Price check failed: ${(e as Error).message}`.slice(0, 160);
      }
    }
  }
  await save(r);
  return r;
}

export async function listProtections(device: string): Promise<Protection[]> {
  const ids = await kv.smembers(K.device(device));
  const recs = await Promise.all(ids.map((id) => kv.get<ProtectionRecord>(K.rec(id))));
  return recs
    .filter((r): r is ProtectionRecord => !!r && r.device === device)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toPublic);
}

export async function getProtection(device: string, id: string): Promise<Protection> {
  await load(device, id);
  return toPublic(await withLock(id, async () => check(await load(device, id))));
}

export async function protectionAction(device: string, id: string, action: "simulate" | "check", params: { price?: number } = {}): Promise<Protection> {
  return withLock(id, async () => {
    const r = await load(device, id);
    if (action === "check") return toPublic(await check(r, true));
    // simulate: demo helper for the video — a price drop that really refunds on the sandbox.
    if (!sandbox()) throw new WatchError("Simulated price drops are only available on the PayPal sandbox", 403, "SANDBOX_ONLY");
    if (r.status !== "active") throw new WatchError("Price protection has ended for this purchase", 409, "NOT_ACTIVE");
    const floor = Math.ceil(r.paidPrice * (1 - MAX_SIMULATED_DROP) * 100) / 100;
    const base = Math.min(r.floorPrice, r.lastPrice ?? r.paidPrice);
    const suggested = params.price && params.price > 0 ? params.price : Math.round(base * 0.95 * 100) / 100;
    const price = Math.max(floor, Math.min(suggested, base));
    if (!(price < r.floorPrice)) {
      throw new WatchError("A simulated drop can go at most 15% under the price you paid.", 409, "SIMULATION_LIMIT");
    }
    await observe(r, r.currency === "EGP" ? Math.round(price) : price, true);
    await save(r);
    return toPublic(r);
  });
}

/** An order-problem (full) refund ends protection for that capture. */
export async function endProtectionForCapture(captureId: string): Promise<void> {
  const id = await kv.get<string>(K.byCapture(captureId));
  if (!id) return;
  const r = await kv.get<ProtectionRecord>(K.rec(id));
  if (!r || r.status !== "active") return;
  r.status = "ended";
  r.message = "Refunded in full — protection ended.";
  await save(r);
  await kv.srem(K.all, id);
}

/** Cron: check every active protection (live prices; expiry). */
export async function runProtections(limit = 200): Promise<{ checked: number; refunded: number }> {
  let checked = 0;
  let refunded = 0;
  for (const id of (await kv.smembers(K.all)).slice(0, limit)) {
    const r0 = await kv.get<ProtectionRecord>(K.rec(id));
    if (!r0) {
      await kv.srem(K.all, id);
      continue;
    }
    const before = r0.refunds.length;
    const r = await withLock(id, async () => check((await kv.get<ProtectionRecord>(K.rec(id))) ?? r0)).catch(() => r0);
    checked++;
    if (r.refunds.length > before) refunded++;
  }
  return { checked, refunded };
}
