import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Offer } from "../types";
import { toChargeable } from "./paypal";

/**
 * Offers are signed when the agent shows them, so the browser cannot tamper
 * with the price/store before checkout. Checkout re-verifies the signature.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.OFFER_SIGNING_SECRET ?? process.env.PAYPAL_CLIENT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error("OFFER_SIGNING_SECRET or PAYPAL_CLIENT_SECRET must be set");
  }
  return "dalil-local-dev-secret";
}

function payload(o: Offer, exp: number): string {
  return JSON.stringify([
    o.id, o.title, o.store, o.url ?? "", o.image ?? "", o.price, o.shipping ?? 0,
    o.total, o.currency, o.trust, o.chargeAmount ?? "", o.chargeCurrency ?? "", exp,
    [...(o.flags ?? [])].sort().join(","),
  ]);
}

function mac(o: Offer, exp: number): string {
  return createHmac("sha256", secret()).update(payload(o, exp)).digest("base64url");
}

export function prepareOffer(o: Offer): Offer {
  const charge = toChargeable(o.total, o.currency);
  const withCharge: Offer = {
    ...o,
    chargeAmount: Number(charge.value),
    chargeCurrency: charge.currency,
    fxRate: charge.rate,
  };
  const exp = Date.now() + TTL_MS;
  return { ...withCharge, sig: `${exp}.${mac(withCharge, exp)}` };
}

export function prepareOffers(offers: Offer[]): Offer[] {
  return offers.map(prepareOffer);
}

export function verifyOffer(o: Offer): boolean {
  if (!o?.sig) return false;
  const [expStr, sig] = o.sig.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const expected = Buffer.from(mac(o, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Generic signed, expiring token (used for stateless agent-to-agent sessions). */
export function signToken(data: object, ttlMs = 15 * 60 * 1000): string {
  const body = Buffer.from(JSON.stringify({ d: data, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(`tok.${body}`).digest("base64url")}`;
}

export function verifyToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", secret()).update(`tok.${body}`).digest("base64url"));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { d, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return exp > Date.now() ? (d as T) : null;
  } catch {
    return null;
  }
}

/**
 * Capability tokens for money actions. Only whoever placed a hold gets its
 * holdToken (needed to capture/void it); only whoever captured gets the
 * captureToken (needed to refund/track). Knowing a PayPal id is not enough.
 */
const DAY = 24 * 3600 * 1000;
export const holdToken = (authorizationId: string, orderId: string) => signToken({ k: "hold", a: authorizationId, o: orderId }, 30 * DAY);
export const captureToken = (captureId: string, orderId: string) => signToken({ k: "cap", c: captureId, o: orderId }, 180 * DAY);

/** Proves this browser created the order — required to authorize it (and so to get its holdToken). */
export const orderToken = (orderId: string) => signToken({ k: "order", o: orderId }, 6 * 3600 * 1000);
export function checkOrderToken(token: unknown, orderId: string): void {
  const d = verifyToken<{ k: string; o: string }>(typeof token === "string" ? token : undefined);
  if (!d || d.k !== "order" || d.o !== orderId) throw new TokenError();
}

export function checkHoldToken(token: unknown, authorizationId: string): void {
  const d = verifyToken<{ k: string; a: string }>(typeof token === "string" ? token : undefined);
  if (!d || d.k !== "hold" || d.a !== authorizationId) throw new TokenError();
}
export function checkCaptureToken(token: unknown, captureId: string): { orderId: string } {
  const d = verifyToken<{ k: string; c: string; o: string }>(typeof token === "string" ? token : undefined);
  if (!d || d.k !== "cap" || d.c !== captureId) throw new TokenError();
  return { orderId: d.o };
}
export class TokenError extends Error {
  status = 403;
  code = "NOT_YOUR_PAYMENT";
  constructor() {
    super("This payment action isn't authorized for this browser.");
  }
}
