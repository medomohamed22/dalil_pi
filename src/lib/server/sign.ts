import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Offer } from "../types";

/**
 * Offers are signed when the agent shows them, so the browser cannot tamper
 * with the price/store/link before an order is prepared. The order step
 * re-verifies the signature. The same secret signs session tokens.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.OFFER_SIGNING_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error("OFFER_SIGNING_SECRET must be set");
  }
  return "dalil-pi-local-dev-secret";
}

function payload(o: Offer, exp: number): string {
  return JSON.stringify([
    o.id, o.title, o.store, o.url ?? "", o.image ?? "", o.price, o.shipping ?? 0,
    o.total, o.currency, o.trust, o.trustScore ?? -1, o.country ?? "", exp,
    [...(o.flags ?? [])].sort().join(","),
  ]);
}

function mac(o: Offer, exp: number): string {
  return createHmac("sha256", secret()).update(payload(o, exp)).digest("base64url");
}

export function prepareOffer(o: Offer): Offer {
  const exp = Date.now() + TTL_MS;
  return { ...o, sig: `${exp}.${mac(o, exp)}` };
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

/** Generic signed, expiring token (sessions, quotes). */
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
