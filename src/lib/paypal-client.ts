"use client";

import type { Mandate, Offer } from "./types";

export const PAYPAL_RESULT_KEY = "dalil-paypal-result";

export interface PayPalResult {
  kind: "approved" | "cancelled";
  /** "vault" for the save-PayPal-for-auto-buy flow, otherwise a checkout order. */
  flow?: "vault" | "order";
  orderId: string;
  payerId?: string;
  t: number;
}

export interface PendingCheckout {
  msgId: string;
  idx: number;
  orderId: string;
  orderToken?: string;
  /** A multi-store cart (one order, one hold per store). */
  kind?: "cart";
}

export interface HoldRecord {
  msgId: string;
  idx: number;
  /** Store index inside a multi-store cart block. */
  unit?: number;
  authorizationId: string;
  holdToken?: string;
  captureAt: number;
}

export class CheckoutError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new CheckoutError(j.error ?? `HTTP ${res.status}`, j.code);
  return j as T;
}

/** Must be called synchronously inside the click handler, or popup blockers kick in. */
export function openPayPalWindow(): Window | null {
  const w = 480;
  const h = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
  const popup = window.open("", "dalil-paypal", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  if (popup) {
    try {
      popup.document.title = "PayPal · Dalil";
      popup.document.body.style.cssText =
        "margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;background:#fff;color:#0a0a0a";
      popup.document.body.textContent = "Opening PayPal…";
    } catch {}
  }
  return popup;
}

export function createOrder(offer: Offer, mandate: Mandate, vault = false) {
  return post<{ id: string; approveUrl: string; orderToken: string; charge: { value: string; currency: string } }>(
    "/api/paypal/create-order",
    { offer, mandate, vault },
  );
}

export function authorize(orderId: string, orderToken?: string) {
  return post<{
    orderId: string;
    authorizationId: string;
    status: string;
    amount: { value: string; currency: string };
    expiresAt?: string;
    shipping: { name?: string; address?: string };
    payerEmail?: string;
    vaultId?: string;
    holdToken: string;
    units: Array<{ referenceId: string; authorizationId: string; status: string; amount: { value: string; currency: string }; holdToken: string }>;
  }>("/api/paypal/authorize", { orderId, orderToken });
}

/** Multi-store cart approved → capture every store (each with its own capture token). */
export function captureCart(orderId: string, orderToken?: string) {
  return post<{
    orderId: string;
    shipping: { name?: string; address?: string };
    payerEmail?: string;
    units: Array<{ referenceId: string; captureId: string; status: string; amount: { value: string; currency: string }; captureToken: string }>;
  }>("/api/paypal/cart/capture", { orderId, orderToken });
}

/** Full refund of one capture (order problem, or a cart store cancelled in its window). */
export function refundPayment(captureId: string, captureToken: string | undefined, reason: "not_received" | "damaged" | "not_as_described" | "cancelled") {
  return post<{ id: string; status: string; amount?: string; currency?: string }>("/api/paypal/refund", { captureId, captureToken, reason });
}

/** Multi-store cart: one PayPal order with one purchase unit per store. */
export function createCart(offers: Offer[], mandate: Mandate) {
  return post<{
    id: string;
    approveUrl: string;
    orderToken: string;
    charge: { value: string; currency: string };
    total: number;
    currency: string;
    units: Array<{ referenceId: string; store: string; shipping: number; items: string[]; charge?: string }>;
  }>("/api/paypal/cart", { offers, mandate });
}

export function capture(authorizationId: string, holdToken?: string) {
  return post<{ id: string; status: string; captureToken: string }>("/api/paypal/capture", { authorizationId, holdToken });
}

export function voidHold(authorizationId: string, holdToken?: string) {
  return post<{ status: string }>("/api/paypal/void", { authorizationId, holdToken });
}

export function readResult(): PayPalResult | null {
  try {
    const raw = localStorage.getItem(PAYPAL_RESULT_KEY);
    return raw ? (JSON.parse(raw) as PayPalResult) : null;
  } catch {
    return null;
  }
}

export function clearResult() {
  try {
    localStorage.removeItem(PAYPAL_RESULT_KEY);
  } catch {}
}
