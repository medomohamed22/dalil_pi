import "server-only";
import { assertPublicUrl, fetchWithTimeout } from "./net";
import type { Address } from "../types";

/**
 * WooCommerce stores that take Pi at checkout (e.g. the Sallanet Pay plugin).
 * Uses the public WooCommerce Store API (no keys):
 *   GET  /wp-json/wc/store/v1/cart              → Cart-Token header + payment_methods
 *   GET  /wp-json/wc/store/v1/products?slug=…   → product id + live price
 *   POST /wp-json/wc/store/v1/cart/add-item     (Cart-Token)
 *   POST /wp-json/wc/store/v1/checkout          (Cart-Token) → order + payment_result.redirect_url
 * The user then pays on the store's own Pi payment page — the Pi goes to the store.
 */
const API = "/wp-json/wc/store/v1";
/** Gateway ids that mean "pay with Pi". */
export const PI_GATEWAY = /sallanet|pi[_-]?network|(^|[_-])pi([_-]|$)|^pi|pinet/i;

export class WooError extends Error {
  status = 422;
  code = "STORE_CHECKOUT_FAILED";
}

/** Tests only: allow a local mock store. Never on Vercel. */
const allowPrivate = () => !process.env.VERCEL && process.env.DALIL_TEST_ALLOW_PRIVATE_STORES === "1";

async function call<T>(origin: string, path: string, init: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}): Promise<{ data: T; token: string | null }> {
  const url = `${origin}${API}${path}`;
  if (!allowPrivate()) await assertPublicUrl(url);
  const res = await fetchWithTimeout(url, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { "Cart-Token": init.token } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "error", // no redirects to other hosts
    timeoutMs: init.timeoutMs ?? 12_000,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new WooError(`The store answered with something that isn't WooCommerce (${res.status})`);
  }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message;
    throw new WooError(`The store refused the order: ${msg ? msg.replace(/<[^>]+>/g, "").slice(0, 200) : res.status}`);
  }
  return { data: data as T, token: res.headers.get("cart-token") };
}

const cache = ((globalThis as unknown as { __dalilWoo?: Map<string, { gateway: string | null; at: number }> }).__dalilWoo ??= new Map());

/** Is this a WooCommerce store with a Pi payment method? Returns the gateway id. Cached 1 h. */
export async function detectWooPi(productUrl: string, timeoutMs = 2500): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(productUrl).origin;
  } catch {
    return null;
  }
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < 3600_000) return hit.gateway;
  let gateway: string | null = null;
  try {
    const { data } = await call<{ payment_methods?: string[] }>(origin, "/cart", { timeoutMs });
    gateway = (data?.payment_methods ?? []).find((m) => typeof m === "string" && PI_GATEWAY.test(m)) ?? null;
  } catch {
    gateway = null;
  }
  cache.set(origin, { gateway, at: Date.now() });
  return gateway;
}

function slugOf(productUrl: string): string | null {
  const u = new URL(productUrl);
  const q = u.searchParams.get("product");
  if (q) return q;
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("product");
  const slug = i >= 0 ? parts[i + 1] : parts.at(-1);
  return slug && /^[\p{L}\p{N}%._-]+$/u.test(slug) ? decodeURIComponent(slug) : null;
}

interface WooProduct {
  id: number;
  name: string;
  is_purchasable?: boolean;
  is_in_stock?: boolean;
  prices?: { price: string; currency_code: string; currency_minor_unit: number };
}

export interface WooResult {
  orderId: string;
  payUrl: string;
  price: number;
  currency: string;
}

function split(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts[0] ?? name, last_name: parts.slice(1).join(" ") || parts[0] || name };
}

/**
 * Places the order at the store with the user's address and the Pi gateway,
 * and returns the store's payment page. Refuses when the store's live price is
 * more than 2 % above the price the user saw.
 */
export async function wooCheckout(opts: { productUrl: string; expectedPrice: number; quantity: number; address: Address; email: string; gateway: string; note?: string }): Promise<WooResult> {
  const origin = new URL(opts.productUrl).origin;
  const slug = slugOf(opts.productUrl);
  if (!slug) throw new WooError("Couldn't find the product on the store");
  const { data: list } = await call<WooProduct[]>(origin, `/products?slug=${encodeURIComponent(slug)}`);
  const p = Array.isArray(list) ? list[0] : undefined;
  if (!p?.id) throw new WooError("Couldn't find the product on the store");
  if (p.is_purchasable === false || p.is_in_stock === false) throw new WooError("The store says this product is out of stock");
  const minor = p.prices?.currency_minor_unit ?? 2;
  const price = Number(p.prices?.price ?? NaN) / 10 ** minor;
  if (!(price > 0)) throw new WooError("The store didn't return a price");
  if (price > opts.expectedPrice * 1.02) throw Object.assign(new WooError(`The store's price changed to ${price} — search again to see the new price`), { code: "PRICE_CHANGED" });

  const cart = await call<{ payment_methods?: string[] }>(origin, "/cart");
  const token = cart.token;
  if (!token) throw new WooError("The store's checkout isn't available for apps (no Cart-Token)");
  if (!(cart.data.payment_methods ?? []).includes(opts.gateway)) throw new WooError("The store no longer offers Pi at checkout");
  await call(origin, "/cart/add-item", { method: "POST", token, body: { id: p.id, quantity: opts.quantity } });

  const a = opts.address;
  const addr = {
    ...split(a.fullName),
    company: "",
    address_1: a.street,
    address_2: a.building ?? "",
    city: a.city,
    state: a.area ?? "",
    postcode: a.postalCode ?? "",
    country: a.country,
    phone: a.phone,
  };
  const { data: out } = await call<{ order_id?: number; payment_result?: { payment_status?: string; redirect_url?: string } }>(origin, "/checkout", {
    method: "POST",
    token,
    timeoutMs: 20_000,
    body: {
      billing_address: { ...addr, email: opts.email },
      shipping_address: addr,
      payment_method: opts.gateway,
      customer_note: (opts.note ?? a.notes ?? "").slice(0, 300),
    },
  });
  const payUrl = out?.payment_result?.redirect_url;
  if (!out?.order_id || !payUrl) throw new WooError("The store created no payment page");
  let pay: URL;
  try {
    pay = new URL(payUrl, origin);
  } catch {
    throw new WooError("The store returned a bad payment link");
  }
  if (pay.protocol !== "https:" && !(allowPrivate() && pay.protocol === "http:")) throw new WooError("The store's payment link isn't secure");
  return { orderId: String(out.order_id), payUrl: pay.href, price, currency: p.prices?.currency_code ?? "" };
}
