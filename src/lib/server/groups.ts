import "server-only";
import { randomBytes } from "node:crypto";
import { authorizeOrder, captureAuthorization, createOrder, PayPalError, toChargeable, voidAuthorization } from "./paypal";
import { kv, storePersistent } from "./store";
import type { GroupView, Offer } from "../types";

/**
 * Group buy: split one purchase between 2–6 people. Each person pays their
 * share through PayPal as a HOLD (authorize). Only when every share is held
 * are they all captured together; if the organizer cancels or the group
 * expires, every hold is voided — nobody pays for a purchase that didn't happen.
 */
const TTL_MS = 24 * 3600_000;
const PENDING_MS = 15 * 60_000;
const K = { group: (id: string) => `group:${id}`, all: "groups:all", lock: (id: string) => `group:${id}:lock` };

/** Serialize changes to one group (two friends paying at the same moment). */
async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 60; i++) {
    if (await kv.setnx(K.lock(id), 30)) {
      try {
        return await fn();
      } finally {
        await kv.del(K.lock(id)).catch(() => {});
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new GroupError("The group is busy — try again in a moment", 503, "BUSY");
}

interface Contribution {
  id: string;
  name: string;
  organizer: boolean;
  orderId: string;
  authorizationId?: string;
  captureId?: string;
  status: "pending" | "held" | "captured" | "voided" | "failed";
  at: number;
}
interface GroupRecord {
  id: string;
  organizer: string; // hashed device id
  offer: Offer;
  shares: number;
  /** In the charge currency (USD for EGP offers). */
  total: string;
  shareAmounts: string[];
  currency: string;
  status: "open" | "completed" | "cancelled" | "expired";
  contributions: Contribution[];
  createdAt: number;
  expiresAt: number;
  message?: string;
}

export class GroupError extends Error {
  constructor(message: string, public status = 400, public code = "GROUP_ERROR") {
    super(message);
  }
}

function split(total: string, n: number): string[] {
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => ((i === n - 1 ? cents - base * (n - 1) : base) / 100).toFixed(2));
}

function view(r: GroupRecord, device?: string): GroupView {
  const live = r.contributions.filter((c) => c.status === "held" || c.status === "captured");
  return {
    id: r.id,
    title: r.offer.title,
    store: r.offer.store,
    image: r.offer.image,
    url: r.offer.url,
    offerTotal: r.offer.total,
    offerCurrency: r.offer.currency,
    total: r.total,
    currency: r.currency,
    shares: r.shares,
    shareAmount: r.status === "open" ? r.shareAmounts[Math.min(live.length, r.shares - 1)] : r.shareAmounts[0],
    paid: live.length,
    status: r.status,
    expiresAt: r.expiresAt,
    isOrganizer: !!device && device === r.organizer,
    organizerPaid: live.some((c) => c.organizer),
    members: r.contributions
      .filter((c) => c.status !== "pending" || Date.now() - c.at < PENDING_MS)
      .map((c) => ({ name: c.name, organizer: c.organizer, status: c.status, at: c.at })),
    message: r.message,
  };
}

async function load(id: string): Promise<GroupRecord> {
  if (!/^[a-z0-9]{10,24}$/.test(id)) throw new GroupError("Group not found", 404, "NOT_FOUND");
  const r = await kv.get<GroupRecord>(K.group(id));
  if (!r) throw new GroupError("Group not found", 404, "NOT_FOUND");
  if (r.status === "open" && Date.now() > r.expiresAt) await release(r, "expired");
  return r;
}
const save = (r: GroupRecord) => kv.set(K.group(r.id), r);

/** Void every hold (cancel/expire). */
async function release(r: GroupRecord, status: "cancelled" | "expired") {
  for (const c of r.contributions) {
    if (c.status === "held" && c.authorizationId) {
      try {
        await voidAuthorization(c.authorizationId);
        c.status = "voided";
      } catch {
        c.status = "failed";
      }
    }
  }
  r.status = status;
  await save(r);
  await kv.srem(K.all, r.id);
}

export async function createGroup(device: string, offer: Offer, shares: number): Promise<GroupView> {
  // Serverless instances don't share memory: without Redis, friends would hit "group not found".
  if (!storePersistent && process.env.VERCEL) {
    throw new GroupError(
      "Group buy needs the shared database (Upstash Redis), which isn't connected on this deployment yet.",
      503,
      "STORAGE_NOT_CONFIGURED",
    );
  }
  if (offer.trust === "suspicious") throw new GroupError("Can't group-buy from a suspicious store", 403, "SUSPICIOUS");
  if (!(shares >= 2 && shares <= 6)) throw new GroupError("2–6 people");
  const charge = toChargeable(offer.total, offer.currency);
  if (Number(charge.value) / shares < 1) throw new GroupError("Each share must be at least 1.00");
  const id = randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12).padEnd(12, "0");
  const r: GroupRecord = {
    id,
    organizer: device,
    offer,
    shares,
    total: charge.value,
    shareAmounts: split(charge.value, shares),
    currency: charge.currency,
    status: "open",
    contributions: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  await save(r);
  await kv.sadd(K.all, id);
  return view(r, device);
}

export async function getGroup(id: string, device?: string): Promise<GroupView> {
  return view(await load(id), device);
}

/** Start paying one share: a PayPal order (AUTHORIZE) for exactly that share. */
export async function payShare(id: string, device: string | undefined, name: string, origin: string) {
  return withLock(id, () => payShareLocked(id, device, name, origin));
}
async function payShareLocked(id: string, device: string | undefined, name: string, origin: string) {
  const r = await load(id);
  if (r.status !== "open") throw new GroupError("This group is closed", 409, "CLOSED");
  const live = r.contributions.filter((c) => c.status === "held" || c.status === "captured");
  if (live.length >= r.shares) throw new GroupError("All shares are already paid", 409, "FULL");
  const organizer = !!device && device === r.organizer && !live.some((c) => c.organizer);
  const amount = r.shareAmounts[live.length];
  const order = await createOrder({
    referenceId: `g${r.id}-${r.contributions.length + 1}`,
    title: `${r.offer.title} — share ${live.length + 1}/${r.shares}`.slice(0, 127),
    store: r.offer.store,
    url: r.offer.url,
    imageUrl: r.offer.image,
    price: Number(amount),
    shipping: 0,
    currency: r.currency,
    returnUrl: `${origin}/paypal/return`,
    cancelUrl: `${origin}/paypal/cancel`,
    // Only the organizer's share collects the shipping address.
    noShipping: !organizer,
  });
  r.contributions.push({
    id: randomBytes(6).toString("hex"),
    name: (name || "").trim().slice(0, 40) || (organizer ? "Organizer" : `Friend ${r.contributions.length + 1}`),
    organizer,
    orderId: order.id,
    status: "pending",
    at: Date.now(),
  });
  await save(r);
  return { orderId: order.id, approveUrl: order.approveUrl, amount, currency: r.currency };
}

/** Buyer approved on PayPal → hold their share; when every share is held, capture them all. */
export async function confirmShare(id: string, orderId: string, device?: string): Promise<GroupView> {
  return withLock(id, () => confirmShareLocked(id, orderId, device));
}
async function confirmShareLocked(id: string, orderId: string, device?: string): Promise<GroupView> {
  const r = await load(id);
  const c = r.contributions.find((x) => x.orderId === orderId);
  if (!c) throw new GroupError("Unknown payment for this group", 404, "UNKNOWN_ORDER");
  if (c.status === "pending") {
    if (r.status !== "open") throw new GroupError("This group is closed", 409, "CLOSED");
    const a = await authorizeOrder(orderId);
    c.authorizationId = a.authorizationId;
    c.status = "held";
    c.at = Date.now();
    await save(r);
  }
  const held = r.contributions.filter((x) => x.status === "held");
  if (r.status === "open" && held.length >= r.shares) {
    for (const h of held) {
      try {
        const cap = await captureAuthorization(h.authorizationId!);
        h.captureId = cap.id;
        h.status = "captured";
      } catch (e) {
        h.status = "failed";
        r.message = e instanceof PayPalError ? e.message : String(e);
      }
    }
    r.status = "completed";
    await save(r);
    await kv.srem(K.all, r.id);
  }
  return view(r, device);
}

export async function cancelGroup(id: string, device: string): Promise<GroupView> {
  return withLock(id, () => cancelGroupLocked(id, device));
}
async function cancelGroupLocked(id: string, device: string): Promise<GroupView> {
  const r = await load(id);
  if (r.organizer !== device) throw new GroupError("Only the organizer can cancel", 403, "FORBIDDEN");
  if (r.status === "open") await release(r, "cancelled");
  return view(r, device);
}

/** Cron: void holds of groups that expired before everyone paid. */
export async function expireGroups(): Promise<number> {
  let n = 0;
  for (const id of await kv.smembers(K.all)) {
    const r = await kv.get<GroupRecord>(K.group(id));
    if (!r) {
      await kv.srem(K.all, id);
      continue;
    }
    if (r.status === "open" && Date.now() > r.expiresAt) {
      await release(r, "expired");
      n++;
    }
  }
  return n;
}
