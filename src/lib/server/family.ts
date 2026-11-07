import "server-only";
import { randomBytes } from "node:crypto";
import { authorizeOrder, captureAuthorization, createOrder, PayPalError, toChargeable, voidAuthorization } from "./paypal";
import { verifyOffer } from "./sign";
import { kv, storePersistent } from "./store";
import { notifyDevice } from "./watches";
import { HOLD_MINUTES, type FamilyStatus, type FamilyView, type Offer } from "../types";

/**
 * Family approval: Dalil drafts a purchase, and a second person (a parent, a
 * partner) approves and pays it from THEIR OWN PayPal account through a share
 * link — within a spending limit the requester set.
 *
 *  - the share link is the only capability; the requester's own browser can't approve it,
 *  - the offer is the signed one Dalil found; its signature and the limit are
 *    re-checked in server code at the moment the approver pays,
 *  - the approver's money is only HELD (AUTHORIZE) with the same 10-minute
 *    cancel window; either side can release it before it's captured.
 */
const TTL_MS = 24 * 3600_000; // offers are signed for 24h, so a request can't outlive its price
const PAYING_STALE_MS = 15 * 60_000;
const K = { rec: (id: string) => `family:${id}`, all: "family:all", lock: (id: string) => `family:${id}:lock` };

export class FamilyError extends Error {
  constructor(message: string, public status = 400, public code = "FAMILY_ERROR") {
    super(message);
  }
}

interface FamilyRecord {
  id: string;
  requester: string; // hashed device id
  requesterName: string;
  note?: string;
  offer: Offer;
  limit: number;
  status: FamilyStatus;
  createdAt: number;
  expiresAt: number;
  orderId?: string;
  orderAt?: number;
  authorizationId?: string;
  captureId?: string;
  holdExpiresAt?: number;
  approver?: string; // hashed device id
  approverEmail?: string;
  decidedAt?: number;
  message?: string;
}

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
  throw new FamilyError("Busy — try again in a moment", 503, "BUSY");
}

const save = (r: FamilyRecord) => kv.set(K.rec(r.id), r);

function maskEmail(e?: string): string | undefined {
  if (!e) return undefined;
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 1)}***@${d}` : undefined;
}

function view(r: FamilyRecord, device?: string): FamilyView {
  const c = toChargeable(r.offer.total, r.offer.currency);
  return {
    id: r.id,
    title: r.offer.title,
    store: r.offer.store,
    image: r.offer.image,
    url: r.offer.url,
    price: r.offer.price,
    shipping: r.offer.shipping ?? 0,
    total: r.offer.total,
    currency: r.offer.currency,
    charge: { value: c.value, currency: c.currency },
    limit: r.limit,
    requesterName: r.requesterName,
    note: r.note,
    trust: r.offer.trust,
    status: r.status,
    isRequester: !!device && device === r.requester,
    isApprover: !!device && device === r.approver,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    holdExpiresAt: r.holdExpiresAt,
    decidedAt: r.decidedAt,
    approverEmail: maskEmail(r.approverEmail),
    message: r.message,
  };
}

/** Lazy housekeeping on every read: expire, and capture holds whose window passed. */
async function settle(r: FamilyRecord): Promise<FamilyRecord> {
  const now = Date.now();
  if ((r.status === "pending" || r.status === "paying") && now > r.expiresAt) {
    r.status = "expired";
    await save(r);
    await kv.srem(K.all, r.id);
  }
  if (r.status === "held" && r.authorizationId && (r.holdExpiresAt ?? 0) <= now) await captureNow(r);
  return r;
}

async function captureNow(r: FamilyRecord) {
  try {
    const c = await captureAuthorization(r.authorizationId!);
    r.captureId = c.id;
    r.status = "captured";
    r.message = undefined;
    await notifyDevice(r.requester, {
      title: `Approved & paid: ${r.offer.title}`.slice(0, 80),
      body: `${r.approverEmail ? maskEmail(r.approverEmail) : "Your family"} paid ${r.offer.total.toLocaleString("en-US")} ${r.offer.currency} via PayPal.`,
      url: "/",
      tag: `family-${r.id}`,
      image: r.offer.image,
    }).catch(() => undefined);
  } catch (e) {
    r.status = "error";
    r.message = `Capture failed: ${(e as Error).message}`.slice(0, 200);
  }
  await save(r);
  await kv.srem(K.all, r.id);
}

async function load(id: string): Promise<FamilyRecord> {
  if (!/^[a-z0-9]{12}$/.test(id)) throw new FamilyError("Request not found", 404, "NOT_FOUND");
  const r = await kv.get<FamilyRecord>(K.rec(id));
  if (!r) throw new FamilyError("Request not found", 404, "NOT_FOUND");
  return r;
}

export async function createFamily(device: string, input: { offer: Offer; limit: number; name: string; note?: string }): Promise<FamilyView> {
  if (!storePersistent && process.env.VERCEL) {
    throw new FamilyError("Family approval needs the shared database (Upstash Redis), which isn't connected on this deployment yet.", 503, "STORAGE_NOT_CONFIGURED");
  }
  const { offer } = input;
  if (offer.trust === "suspicious") throw new FamilyError("Can't ask family to pay a suspicious store", 403, "SUSPICIOUS");
  if (!(input.limit > 0)) throw new FamilyError("Set a spending limit", 400, "LIMIT_REQUIRED");
  if (offer.total > input.limit) {
    throw new FamilyError(`The total (${offer.total} ${offer.currency}) is above the limit you set (${input.limit}).`, 403, "OVER_LIMIT");
  }
  const id = randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12).padEnd(12, "0");
  const now = Date.now();
  const sigExp = Number(offer.sig?.split(".")[0]) || now + TTL_MS;
  const r: FamilyRecord = {
    id,
    requester: device,
    requesterName: input.name.trim().slice(0, 40) || "Someone",
    note: input.note?.trim().slice(0, 140) || undefined,
    offer,
    limit: Math.round(input.limit * 100) / 100,
    status: "pending",
    createdAt: now,
    expiresAt: Math.min(now + TTL_MS, sigExp),
  };
  await save(r);
  await kv.sadd(K.all, id);
  return view(r, device);
}

export async function getFamily(id: string, device?: string): Promise<FamilyView> {
  const r = await load(id);
  if (r.status === "held" || r.status === "pending" || r.status === "paying") {
    return view(await withLock(id, async () => settle(await load(id))), device);
  }
  return view(r, device);
}

/** The approver starts paying: a PayPal order (AUTHORIZE) for the signed offer, re-checked against the limit. */
export async function startApproval(id: string, device: string | undefined, origin: string) {
  return withLock(id, async () => {
    const r = await settle(await load(id));
    if (device && device === r.requester) {
      throw new FamilyError("This request is for someone else to approve — send them the link.", 403, "SELF_APPROVAL");
    }
    const stalePaying = r.status === "paying" && Date.now() - (r.orderAt ?? 0) > PAYING_STALE_MS;
    if (r.status !== "pending" && !(r.status === "paying" && (stalePaying || (device && device === r.approver)))) {
      throw new FamilyError("This request is no longer waiting for approval", 409, "CLOSED");
    }
    // Server-side checks at the moment money moves.
    if (!verifyOffer(r.offer)) throw new FamilyError("This price has expired — ask Dalil to check again.", 409, "OFFER_EXPIRED");
    if (r.offer.total > r.limit) throw new FamilyError("Above the spending limit", 403, "OVER_LIMIT");
    const order = await createOrder({
      referenceId: `f${r.id}-${Date.now().toString(36)}`,
      title: r.offer.title,
      store: r.offer.store,
      url: r.offer.url,
      imageUrl: r.offer.image,
      price: r.offer.price,
      shipping: r.offer.shipping ?? 0,
      currency: r.offer.currency,
      returnUrl: `${origin}/paypal/return`,
      cancelUrl: `${origin}/paypal/cancel`,
    });
    r.status = "paying";
    r.orderId = order.id;
    r.orderAt = Date.now();
    r.approver = device;
    r.message = undefined;
    await save(r);
    return { orderId: order.id, approveUrl: order.approveUrl, charge: order.charge };
  });
}

/** Approver came back from PayPal → place the hold (10-minute cancel window). */
export async function confirmApproval(id: string, orderId: string, device?: string): Promise<FamilyView> {
  return withLock(id, async () => {
    const r = await load(id);
    if (!r.orderId || r.orderId !== orderId) throw new FamilyError("Unknown payment for this request", 404, "UNKNOWN_ORDER");
    // Only the browser that started this payment can complete it (and become the approver).
    if (r.approver && device !== r.approver) throw new FamilyError("This payment was started on another device", 403, "NOT_APPROVER");
    if (r.status === "paying") {
      const a = await authorizeOrder(orderId);
      r.authorizationId = a.authorizationId;
      r.approverEmail = a.payerEmail;
      r.status = "held";
      r.decidedAt = Date.now();
      r.holdExpiresAt = Date.now() + HOLD_MINUTES * 60_000;
      await save(r);
      await notifyDevice(r.requester, {
        title: `Approved: ${r.offer.title}`.slice(0, 80),
        body: `Your request was approved in PayPal. Funds are held — charged in ${HOLD_MINUTES} min.`,
        url: "/",
        tag: `family-${r.id}`,
        image: r.offer.image,
      }).catch(() => undefined);
    }
    return view(r, device);
  });
}

/** Approver declines; requester cancels; or either releases the hold within the window. Approver may also confirm now. */
export async function familyAction(id: string, device: string | undefined, action: "decline" | "cancel" | "capture"): Promise<FamilyView> {
  return withLock(id, async () => {
    const r = await settle(await load(id));
    const isRequester = !!device && device === r.requester;
    const isApprover = !!device && device === r.approver;
    if (action === "capture") {
      if (!isApprover || r.status !== "held") throw new FamilyError("Nothing to confirm", 409, "NOT_HELD");
      await captureNow(r);
      return view(r, device);
    }
    if (action === "decline" && isRequester) throw new FamilyError("Use cancel for your own request", 400, "USE_CANCEL");
    if (action === "cancel" && !isRequester && !isApprover) throw new FamilyError("Only the requester or the approver can cancel", 403, "FORBIDDEN");
    if (r.status === "held" && r.authorizationId) {
      if (action === "decline" && !isApprover) throw new FamilyError("Only the approver can release this hold", 403, "FORBIDDEN");
      await voidAuthorization(r.authorizationId);
    } else if (r.status !== "pending" && r.status !== "paying") {
      throw new FamilyError("This request is already closed", 409, "CLOSED");
    }
    r.status = action === "decline" ? "declined" : "cancelled";
    r.decidedAt = Date.now();
    await save(r);
    await kv.srem(K.all, r.id);
    if (action === "decline") {
      await notifyDevice(r.requester, {
        title: `Declined: ${r.offer.title}`.slice(0, 80),
        body: "Your family declined this purchase — nothing was charged.",
        url: "/",
        tag: `family-${r.id}`,
      }).catch(() => undefined);
    }
    return view(r, device);
  });
}

/** Cron: capture holds whose window passed, expire unanswered requests. */
export async function sweepFamily(): Promise<{ captured: number; expired: number }> {
  let captured = 0;
  let expired = 0;
  for (const id of await kv.smembers(K.all)) {
    const r0 = await kv.get<FamilyRecord>(K.rec(id));
    if (!r0) {
      await kv.srem(K.all, id);
      continue;
    }
    const before = r0.status;
    const r = await withLock(id, async () => settle(await load(id))).catch(() => r0);
    if (before === "held" && r.status === "captured") captured++;
    if (r.status === "expired" && before !== "expired") expired++;
  }
  return { captured, expired };
}

export function familyFail(e: unknown): Response {
  if (e instanceof SyntaxError) return Response.json({ error: "Invalid request", code: "BAD_JSON" }, { status: 400 });
  if (e instanceof FamilyError || e instanceof PayPalError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  return Response.json({ error: e instanceof Error ? e.message : String(e), code: "SERVER_ERROR" }, { status: 500 });
}
