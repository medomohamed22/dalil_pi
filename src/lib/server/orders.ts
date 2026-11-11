import "server-only";
import { forget } from "./cache";
import { MIN_ORDER_TRUST } from "./trust";
import { detectWooPi, wooCheckout } from "./woo";
import { getAddress, listAddresses, NotFound } from "./addresses";
import { piUsdPrice } from "./price";
import { verifyOffer } from "./sign";
import { supabase, supabaseEnabled } from "./supabase";
import type { Address, Offer, Order, OrderStatus } from "../types";

/**
 * Orders started from a product card. We store what was bought and where it
 * ships; the payment itself goes from the user's Pi wallet to the store.
 * Connectors (WooCommerce + Sallanet, Salla, partners) fill external ids later.
 */

interface Row {
  id: string;
  status: OrderStatus;
  store_name: string;
  store_domain: string | null;
  product_title: string;
  product_url: string | null;
  product_image: string | null;
  quantity: number;
  price: string | number;
  currency: string;
  total: string | number;
  total_usd: string | number | null;
  country: string | null;
  trust: string | null;
  address_id: string | null;
  shipping: Order["shipping"];
  connector: string | null;
  checkout_url: string | null;
  txid: string | null;
  tracking_number: string | null;
  created_at: string;
}

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

const fromRow = (r: Row): Order => ({
  id: r.id,
  status: r.status,
  storeName: r.store_name,
  storeDomain: r.store_domain,
  productTitle: r.product_title,
  productUrl: r.product_url,
  productImage: r.product_image,
  quantity: r.quantity,
  price: Number(r.price),
  currency: r.currency,
  total: Number(r.total),
  totalUsd: num(r.total_usd),
  country: r.country,
  trust: r.trust,
  addressId: r.address_id,
  shipping: r.shipping,
  connector: r.connector,
  checkoutUrl: r.checkout_url,
  txid: r.txid,
  trackingNumber: r.tracking_number,
  createdAt: r.created_at,
});

const g = globalThis as unknown as { __dalilOrders?: Map<string, Order[]> };
const mem: Map<string, Order[]> = (g.__dalilOrders ??= new Map());

export class BadOffer extends Error {
  status = 400;
  code = "OFFER_INVALID";
}

function shippingSnapshot(a: Address): NonNullable<Order["shipping"]> {
  const { id: _id, isDefault: _d, ...rest } = a;
  void _id;
  void _d;
  return rest;
}

const ORDER_COLUMNS =
  "id, status, store_name, store_domain, product_title, product_url, product_image, quantity, price, currency, total, total_usd, country, trust, address_id, shipping, connector, checkout_url, txid, tracking_number, created_at";

export async function listOrders(uid: string, limit = 50): Promise<Order[]> {
  if (!supabaseEnabled) return (mem.get(uid) ?? []).slice(0, limit);
  // Only the columns the app shows — the signed offer snapshot (jsonb) stays in the database (less egress).
  const { data, error } = await supabase().from("orders").select(ORDER_COLUMNS).eq("pi_uid", uid).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`orders: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

/**
 * Creates an order from a server-signed offer. The address is optional: given
 * an id it uses that one, otherwise the user's default address (if any).
 */
function hostOfLink(url?: string): string | undefined {
  if (!url) return;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return;
  }
}

export async function createOrder(uid: string, offer: Offer, addressId?: string, quantity = 1, auto?: { email: string }): Promise<Order> {
  if (!verifyOffer(offer)) throw new BadOffer("This offer expired or was changed. Search again to get a fresh price.");
  if (offer.flags?.includes("price_unverified")) throw new BadOffer("This price wasn't confirmed on the store page.");
  if (offer.trust === "suspicious") throw new BadOffer("This store looks suspicious, so Dalil Pi won't place the order.");
  if (offer.trustScore != null && offer.trustScore < MIN_ORDER_TRUST) throw new BadOffer(`This store's trust score is ${offer.trustScore}/100, so Dalil Pi won't place the order.`);
  if (!offer.url) throw new BadOffer("This offer has no store link.");
  const address = addressId ? await getAddress(uid, addressId) : (await listAddresses(uid)).find((a) => a.isDefault) ?? null;
  // Automatic checkout: place the order at the store (WooCommerce + Pi gateway) with the user's address.
  let store: { connector: string; checkout_url: string; external_order_id: string; status: OrderStatus } | null = null;
  if (auto) {
    if (offer.checkout !== "woo_pi") throw new BadOffer("This store doesn't support automatic checkout.");
    if (!address) throw Object.assign(new BadOffer("Add a shipping address first."), { code: "ADDRESS_REQUIRED" });
    const gateway = await detectWooPi(offer.url);
    if (!gateway) throw new BadOffer("The store no longer offers Pi at checkout.");
    const r = await wooCheckout({ productUrl: offer.url, expectedPrice: offer.price, quantity, address, email: auto.email, gateway });
    store = { connector: "woo_sallanet", checkout_url: r.payUrl, external_order_id: r.orderId, status: "awaiting_payment" };
  }
  const price = await piUsdPrice();
  const total = Math.round(offer.total * quantity * 1e7) / 1e7;
  const totalUsd = offer.currency === "PI" && price ? Math.round(total * price.usd * 100) / 100 : null;
  const base = {
    status: "draft" as OrderStatus,
    store_name: offer.store,
    // The store is the signed product link's host (the client can't point reviews at another store).
    store_domain: hostOfLink(offer.url) ?? null,
    product_title: offer.title,
    product_url: offer.url ?? null,
    product_image: offer.image ?? null,
    quantity,
    price: offer.price,
    currency: offer.currency,
    shipping_cost: offer.shipping ?? null,
    total,
    total_usd: totalUsd,
    pi_usd_rate: offer.currency === "PI" && price ? price.usd : null,
    country: offer.country ?? address?.country ?? null,
    trust: offer.trust,
    // Signed snapshot for the record — without the bulky display-only parts (less storage and egress).
    offer: { ...offer, trustParts: undefined, reviews: undefined, reason: undefined },
    address_id: address?.id ?? null,
    shipping: address ? shippingSnapshot(address) : null,
    // Default connector: the "Order" button opens the product page in the store.
    connector: "deeplink",
    checkout_url: offer.url ?? null,
    ...(store ?? {}),
  };
  if (!supabaseEnabled) {
    const o = fromRow({ id: crypto.randomUUID(), created_at: new Date().toISOString(), external_order_id: null, txid: null, tracking_number: null, ...base } as unknown as Row);
    mem.set(uid, [o, ...(mem.get(uid) ?? [])]);
    return o;
  }
  const { data, error } = await supabase().from("orders").insert({ pi_uid: uid, ...base }).select(ORDER_COLUMNS).single();
  if (error) throw new Error(`orders: ${error.message}`);
  return fromRow(data as Row);
}

/** What the user may change on their own order. */
const USER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["placed", "paid", "cancelled"],
  placed: ["paid", "cancelled"],
  awaiting_payment: ["paid", "cancelled"],
  paid: ["shipped", "delivered"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  failed: [],
};

export async function updateOrder(uid: string, id: string, patch: { status?: OrderStatus; txid?: string | null; trackingNumber?: string | null }): Promise<Order> {
  const all = await listOrders(uid, 500);
  const cur = all.find((o) => o.id === id);
  if (!cur) throw new NotFound("Order not found");
  if (patch.status && patch.status !== cur.status && !USER_TRANSITIONS[cur.status].includes(patch.status)) {
    throw Object.assign(new Error(`Can't change an order from ${cur.status} to ${patch.status}`), { status: 400, code: "BAD_STATUS" });
  }
  if (!supabaseEnabled) {
    const next = { ...cur, ...(patch.status ? { status: patch.status } : {}), ...(patch.txid !== undefined ? { txid: patch.txid } : {}), ...(patch.trackingNumber !== undefined ? { trackingNumber: patch.trackingNumber } : {}) };
    mem.set(uid, (mem.get(uid) ?? []).map((o) => (o.id === id ? next : o)));
    return next;
  }
  const row: Record<string, unknown> = {};
  if (patch.status) row.status = patch.status;
  if (patch.txid !== undefined) row.txid = patch.txid;
  if (patch.trackingNumber !== undefined) row.tracking_number = patch.trackingNumber;
  forget("fulfilment");
  const { data, error } = await supabase().from("orders").update(row).eq("pi_uid", uid).eq("id", id).select(ORDER_COLUMNS).single();
  if (error) throw new Error(`orders: ${error.message}`);
  return fromRow(data as Row);
}
