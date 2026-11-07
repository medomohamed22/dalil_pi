import "server-only";
import { fetchWithTimeout } from "./net";

/**
 * PayPal REST client (Orders v2 + Payments v2), sandbox by default.
 *
 * Dalil never captures money on approval: orders use intent=AUTHORIZE so the
 * buyer's funds are only HELD. Capture happens after the 10-minute cancel
 * window (or when the user confirms); cancel = void the authorization.
 */

const ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
export const PAYPAL_API =
  process.env.PAYPAL_API_BASE /* tests only */ ??
  (ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

export class PayPalError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = "PAYPAL_ERROR",
    public debugId?: string,
    /** JSON pointer of the rejected field, e.g. /purchase_units/0/items/0/url */
    public field?: string,
  ) {
    super(message);
  }
}

/** PayPal resource ids are short alphanumerics. Anything else (e.g. "../") must never reach a URL path. */
function pid(id: unknown): string {
  const v = String(id ?? "");
  if (!/^[A-Za-z0-9-]{6,40}$/.test(v)) throw new PayPalError("Invalid PayPal id", 400, "INVALID_ID");
  return v;
}


export function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (!paypalConfigured()) {
    throw new PayPalError("PayPal is not configured on the server", 503, "PAYPAL_NOT_CONFIGURED");
  }
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithTimeout(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    timeoutMs: 15000,
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, 502, "PAYPAL_AUTH_FAILED");
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function pp<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; requestId?: string } = {},
): Promise<T> {
  const token = await accessToken();
  const res = await fetchWithTimeout(`${PAYPAL_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    timeoutMs: 30000,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json?.details?.[0];
    throw new PayPalError(
      detail?.description ?? json?.message ?? `PayPal ${res.status}`,
      res.status,
      detail?.issue ?? json?.name ?? "PAYPAL_ERROR",
      json?.debug_id,
      detail?.field,
    );
  }
  return json as T;
}

/* ---------------- Money ---------------- */

/** PayPal does not settle EGP, so EGP prices are charged in USD at a fixed, disclosed rate. */
export function toChargeable(amount: number, currency: string): { value: string; currency: string; rate?: number } {
  const cur = currency.toUpperCase();
  if (cur === "EGP") {
    const rate = Number(process.env.EGP_PER_USD) || 50;
    return { value: (Math.ceil((amount / rate) * 100) / 100).toFixed(2), currency: "USD", rate };
  }
  const zeroDecimal = ["JPY", "HUF", "TWD"].includes(cur);
  return { value: zeroDecimal ? Math.round(amount).toFixed(0) : amount.toFixed(2), currency: cur };
}

/* ---------------- Orders ---------------- */

export interface OrderInput {
  referenceId: string;
  title: string;
  store: string;
  url?: string;
  imageUrl?: string;
  price: number;
  shipping: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  /** Save the buyer's PayPal wallet (Vault) for future auto-buys. */
  vault?: boolean;
  /** Don't collect a shipping address (e.g. a friend's share of a group buy). */
  noShipping?: boolean;
}

export interface CreatedOrder {
  id: string;
  approveUrl: string;
  charge: { value: string; currency: string };
}

export async function createOrder(input: OrderInput): Promise<CreatedOrder> {
  const item = toChargeable(input.price, input.currency);
  const ship = toChargeable(input.shipping, input.currency);
  const total = (Number(item.value) + Number(ship.value)).toFixed(2);
  const currency = item.currency;

  // PayPal validates these strictly: item url must be a plain https URL and
  // image_url must end in .jpg/.jpeg/.png/.gif (no ;params or query strings).
  const safeUrl = (u?: string) => {
    if (!u || u.length > 2000) return undefined;
    try {
      const x = new URL(u);
      return x.protocol === "https:" && !/[\s"'<>]/.test(u) ? x.toString() : undefined;
    } catch {
      return undefined;
    }
  };
  const safeImage = (u?: string) => (u && u.length < 2000 && /^https:\/\/[\w\-./%]+\.(jpe?g|png|gif)$/i.test(u) ? u : undefined);

  const body = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: input.referenceId.slice(0, 256),
        description: `Dalil agent purchase · ${input.store}`.slice(0, 127),
        soft_descriptor: "DALIL",
        amount: {
          currency_code: currency,
          value: total,
          breakdown: {
            item_total: { currency_code: currency, value: item.value },
            shipping: { currency_code: currency, value: ship.value },
          },
        },
        items: [
          {
            name: input.title.slice(0, 127),
            quantity: "1",
            category: "PHYSICAL_GOODS",
            unit_amount: { currency_code: currency, value: item.value },
            ...(safeUrl(input.url) ? { url: safeUrl(input.url) } : {}),
            ...(safeImage(input.imageUrl) ? { image_url: safeImage(input.imageUrl) } : {}),
          },
        ],
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Dalil",
          shipping_preference: input.noShipping ? "NO_SHIPPING" : "GET_FROM_FILE", // ship to the buyer's PayPal address
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
        ...(input.vault
          ? {
              attributes: {
                vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", customer_type: "CONSUMER" },
              },
            }
          : {}),
      },
    },
  };

  type Created = { id: string; links: Array<{ rel: string; href: string }> };
  let order: Created;
  try {
    order = await pp<Created>("/v2/checkout/orders", {
      method: "POST",
      body,
      requestId: `dalil-${input.referenceId}`.slice(0, 108),
    });
  } catch (e) {
    // A merchant's odd product/image URL must never block checkout: retry without them.
    if (!(e instanceof PayPalError) || (e.status !== 400 && e.status !== 422)) throw e;
    const it = body.purchase_units[0].items[0] as Record<string, unknown>;
    if (!("url" in it) && !("image_url" in it)) throw e;
    console.warn(`[paypal] create order rejected (${e.code} ${e.field ?? ""} debug_id=${e.debugId}); retrying without item url/image`);
    delete it.url;
    delete it.image_url;
    order = await pp<Created>("/v2/checkout/orders", {
      method: "POST",
      body,
      requestId: `dalil-${input.referenceId}-r`.slice(0, 108),
    });
  }
  const approve = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!approve) throw new PayPalError("No approval link returned", 502);
  return { id: order.id, approveUrl: approve.href, charge: { value: total, currency } };
}

/* ---------------- Multi-store cart: one order, one approval ---------------- */

export interface CartUnitInput {
  /** Unique per order — PayPal matches each hold back to its store by this id. */
  referenceId: string;
  store: string;
  shipping: number;
  items: Array<{ title: string; price: number; url?: string }>;
}

/**
 * One PayPal order with one purchase unit per store. The buyer approves once.
 * PayPal only allows intent=CAPTURE for orders with several purchase units
 * (AUTHORIZE is single-unit only), so the cart is paid on approval and each
 * store gets its own capture — cancelling a store refunds that capture in full.
 */
export async function createCartOrder(input: {
  cartId: string;
  units: CartUnitInput[];
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CreatedOrder & { units: Array<{ referenceId: string; value: string }> }> {
  if (input.units.length < 1 || input.units.length > 10) throw new PayPalError("A cart holds 1–10 stores", 400, "CART_SIZE");
  let currency = "";
  let grand = 0;
  const unitTotals: Array<{ referenceId: string; value: string }> = [];
  const purchase_units = input.units.map((u) => {
    const items = u.items.map((it) => {
      const c = toChargeable(it.price, input.currency);
      currency = c.currency;
      return { name: it.title.slice(0, 127), quantity: "1", category: "PHYSICAL_GOODS", unit_amount: { currency_code: c.currency, value: c.value } };
    });
    const itemTotal = items.reduce((a, it) => a + Number(it.unit_amount.value), 0);
    const ship = toChargeable(u.shipping, input.currency);
    const value = (itemTotal + Number(ship.value)).toFixed(2);
    grand += Number(value);
    unitTotals.push({ referenceId: u.referenceId, value });
    return {
      reference_id: u.referenceId.slice(0, 256),
      description: `Dalil cart · ${u.store}`.slice(0, 127),
      soft_descriptor: "DALIL",
      amount: {
        currency_code: currency,
        value,
        breakdown: {
          item_total: { currency_code: currency, value: itemTotal.toFixed(2) },
          shipping: { currency_code: currency, value: ship.value },
        },
      },
      items,
    };
  });
  const order = await pp<{ id: string; links: Array<{ rel: string; href: string }> }>("/v2/checkout/orders", {
    method: "POST",
    requestId: `dalil-cart-${input.cartId}`.slice(0, 108),
    body: {
      intent: "CAPTURE",
      purchase_units,
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Dalil",
            shipping_preference: "GET_FROM_FILE",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const approve = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!approve) throw new PayPalError("No approval link returned", 502);
  return { id: order.id, approveUrl: approve.href, charge: { value: grand.toFixed(2), currency }, units: unitTotals };
}

export interface ShippingInfo {
  name?: string;
  address?: string;
}

export interface Authorized {
  orderId: string;
  authorizationId: string;
  status: string;
  amount: { value: string; currency: string };
  expiresAt?: string;
  shipping: ShippingInfo;
  payerEmail?: string;
  vaultId?: string;
  customerId?: string;
  /** One hold per purchase unit (a multi-store cart has one unit per store). */
  units: Array<{ referenceId: string; authorizationId: string; status: string; amount: { value: string; currency: string } }>;
}

type OrderJson = {
  id: string;
  status: string;
  payer?: { email_address?: string };
  payment_source?: {
    paypal?: {
      email_address?: string;
      attributes?: { vault?: { id?: string; status?: string; customer?: { id?: string } } };
    };
  };
  purchase_units?: Array<{
    reference_id?: string;
    shipping?: {
      name?: { full_name?: string };
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        admin_area_2?: string;
        admin_area_1?: string;
        postal_code?: string;
        country_code?: string;
      };
    };
    payments?: {
      captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }>;
      authorizations?: Array<{
        id: string;
        status: string;
        amount: { value: string; currency_code: string };
        expiration_time?: string;
      }>;
    };
  }>;
};

function formatShipping(o: OrderJson): ShippingInfo {
  const sh = o.purchase_units?.[0]?.shipping;
  const a = sh?.address;
  return {
    name: sh?.name?.full_name,
    address: a
      ? [a.address_line_1, a.address_line_2, a.admin_area_2, a.admin_area_1, a.postal_code, a.country_code]
          .filter(Boolean)
          .join(", ")
      : undefined,
  };
}

function toAuthorized(o: OrderJson): Authorized {
  const auth = o.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new PayPalError("Order has no authorization", 409, "NO_AUTHORIZATION");
  return {
    orderId: o.id,
    authorizationId: auth.id,
    status: auth.status,
    amount: { value: auth.amount.value, currency: auth.amount.currency_code },
    expiresAt: auth.expiration_time,
    shipping: formatShipping(o),
    payerEmail: o.payment_source?.paypal?.email_address ?? o.payer?.email_address,
    vaultId: o.payment_source?.paypal?.attributes?.vault?.id,
    customerId: o.payment_source?.paypal?.attributes?.vault?.customer?.id,
    units: (o.purchase_units ?? []).flatMap((u, i) => {
      const a = u.payments?.authorizations?.[0];
      return a
        ? [{ referenceId: u.reference_id ?? String(i), authorizationId: a.id, status: a.status, amount: { value: a.amount.value, currency: a.amount.currency_code } }]
        : [];
    }),
  };
}

export interface CartCaptured {
  orderId: string;
  shipping: ShippingInfo;
  payerEmail?: string;
  units: Array<{ referenceId: string; captureId: string; status: string; amount: { value: string; currency: string } }>;
}

/** Multi-store cart: the buyer approved once → capture every store's purchase unit. */
export async function captureCartOrder(orderId: string): Promise<CartCaptured> {
  if (!/^[A-Z0-9]{10,25}$/.test(orderId)) throw new PayPalError("Invalid order id", 400, "INVALID_ORDER_ID");
  let o: OrderJson;
  try {
    o = await pp<OrderJson>(`/v2/checkout/orders/${pid(orderId)}/capture`, { method: "POST", body: {}, requestId: `dalil-cartcap-${orderId}` });
  } catch (e) {
    // Idempotency: already captured → read the captures back.
    if (e instanceof PayPalError && e.code === "ORDER_ALREADY_CAPTURED") o = await pp<OrderJson>(`/v2/checkout/orders/${pid(orderId)}`);
    else throw e;
  }
  const units = (o.purchase_units ?? []).flatMap((u, i) => {
    const c = u.payments?.captures?.[0];
    return c ? [{ referenceId: u.reference_id ?? String(i), captureId: c.id, status: c.status, amount: { value: c.amount.value, currency: c.amount.currency_code } }] : [];
  });
  if (!units.length) throw new PayPalError("PayPal returned no captures for this cart", 409, "NO_CAPTURE");
  return { orderId: o.id ?? orderId, shipping: formatShipping(o), payerEmail: o.payment_source?.paypal?.email_address ?? o.payer?.email_address, units };
}

/** Buyer approved on PayPal → place the hold. */
export async function authorizeOrder(orderId: string): Promise<Authorized> {
  if (!/^[A-Z0-9]{10,25}$/.test(orderId)) throw new PayPalError("Invalid order id", 400, "INVALID_ORDER_ID");
  try {
    const o = await pp<OrderJson>(`/v2/checkout/orders/${pid(orderId)}/authorize`, {
      method: "POST",
      body: {},
      requestId: `dalil-auth-${orderId}`,
    });
    return toAuthorized(o);
  } catch (e) {
    // Idempotency: if it was already authorized, return the existing hold.
    if (e instanceof PayPalError && e.code === "ORDER_ALREADY_AUTHORIZED") {
      return toAuthorized(await pp<OrderJson>(`/v2/checkout/orders/${pid(orderId)}`));
    }
    throw e;
  }
}

/** Auto-buy: charge a vaulted PayPal wallet without the buyer present (still only a hold). */
export async function createAndAuthorizeWithVault(
  input: Omit<OrderInput, "returnUrl" | "cancelUrl" | "vault"> & { vaultId: string },
): Promise<Authorized> {
  const item = toChargeable(input.price, input.currency);
  const ship = toChargeable(input.shipping, input.currency);
  const total = (Number(item.value) + Number(ship.value)).toFixed(2);
  const o = await pp<OrderJson>("/v2/checkout/orders", {
    method: "POST",
    requestId: `dalil-auto-${input.referenceId}`.slice(0, 108),
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId.slice(0, 256),
          description: `Dalil auto-buy · ${input.store}`.slice(0, 127),
          amount: {
            currency_code: item.currency,
            value: total,
            breakdown: {
              item_total: { currency_code: item.currency, value: item.value },
              shipping: { currency_code: item.currency, value: ship.value },
            },
          },
          items: [
            {
              name: input.title.slice(0, 127),
              quantity: "1",
              category: "PHYSICAL_GOODS",
              unit_amount: { currency_code: item.currency, value: item.value },
            },
          ],
        },
      ],
      payment_source: { paypal: { vault_id: input.vaultId } },
    },
  });
  // With a vault_id PayPal can complete without redirect; authorize if needed.
  if (o.status === "COMPLETED" || o.purchase_units?.[0]?.payments?.authorizations?.length) return toAuthorized(o);
  return authorizeOrder(o.id);
}

export async function captureAuthorization(
  authorizationId: string,
): Promise<{ id: string; status: string; amount?: string; currency?: string }> {
  if (!/^[A-Z0-9]{10,25}$/.test(authorizationId)) throw new PayPalError("Invalid authorization id", 400);
  const r = await pp<{ id: string; status: string; amount?: { value: string; currency_code: string } }>(
    `/v2/payments/authorizations/${pid(authorizationId)}/capture`,
    {
      method: "POST",
      body: { final_capture: true },
      requestId: `dalil-cap-${authorizationId}`,
    },
  );
  return { id: r.id, status: r.status, amount: r.amount?.value, currency: r.amount?.currency_code };
}

/** Read a capture back from PayPal (amount actually charged — the source of truth for price protection). */
export async function getCapture(captureId: string): Promise<{ id: string; status: string; amount: string; currency: string }> {
  if (!/^[A-Z0-9]{10,25}$/.test(captureId)) throw new PayPalError("Invalid capture id", 400);
  const r = await pp<{ id: string; status: string; amount: { value: string; currency_code: string } }>(
    `/v2/payments/captures/${pid(captureId)}`,
  );
  return { id: r.id, status: r.status, amount: r.amount.value, currency: r.amount.currency_code };
}

/** The purchase-unit reference ids of an order (each single purchase uses the signed offer's id). */
export async function getOrderReferenceIds(orderId: string): Promise<string[]> {
  const o = await pp<OrderJson>(`/v2/checkout/orders/${pid(orderId)}`);
  return (o.purchase_units ?? []).map((u) => u.reference_id ?? "").filter(Boolean);
}

export async function voidAuthorization(authorizationId: string): Promise<{ status: string }> {
  if (!/^[A-Z0-9]{10,25}$/.test(authorizationId)) throw new PayPalError("Invalid authorization id", 400);
  await pp(`/v2/payments/authorizations/${pid(authorizationId)}/void`, { method: "POST" });
  const a = await pp<{ status: string }>(`/v2/payments/authorizations/${pid(authorizationId)}`);
  return { status: a.status };
}

export async function getAuthorization(authorizationId: string): Promise<{ status: string; expiresAt?: string }> {
  const a = await pp<{ status: string; expiration_time?: string }>(`/v2/payments/authorizations/${pid(authorizationId)}`);
  return { status: a.status, expiresAt: a.expiration_time };
}

/* ---------------- Vault (save PayPal for auto-buy, no purchase) ---------------- */

export async function createVaultSetupToken(returnUrl: string, cancelUrl: string): Promise<{ id: string; approveUrl: string }> {
  const r = await pp<{ id: string; links: Array<{ rel: string; href: string }> }>("/v3/vault/setup-tokens", {
    method: "POST",
    requestId: `dalil-vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body: {
      payment_source: {
        paypal: {
          description: "Dalil auto-buy: purchases only within the limits you set",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: false,
          experience_context: {
            brand_name: "Dalil",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  });
  const approve = r.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
  if (!approve) throw new PayPalError("No vault approval link", 502);
  return { id: r.id, approveUrl: approve.href };
}

export async function createPaymentToken(setupTokenId: string): Promise<{ id: string; customerId?: string }> {
  if (!/^[A-Za-z0-9-]{6,64}$/.test(setupTokenId)) throw new PayPalError("Invalid setup token", 400);
  const r = await pp<{ id: string; customer?: { id?: string } }>("/v3/vault/payment-tokens", {
    method: "POST",
    requestId: `dalil-ptok-${setupTokenId}`,
    body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
  });
  return { id: r.id, customerId: r.customer?.id };
}

/* ---------------- After the purchase: tracking & refunds ---------------- */

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  addedAt: number;
}

/** Attach shipment tracking to the order (shows in the buyer's PayPal activity). */
export async function addTracking(orderId: string, captureId: string, carrierName: string): Promise<TrackingInfo> {
  if (!/^[A-Z0-9]{10,25}$/.test(orderId) || !/^[A-Z0-9]{10,25}$/.test(captureId)) {
    throw new PayPalError("Invalid order or capture id", 400);
  }
  const trackingNumber = `DL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await pp(`/v2/checkout/orders/${pid(orderId)}/track`, {
    method: "POST",
    requestId: `dalil-track-${captureId}`,
    body: {
      capture_id: captureId,
      tracking_number: trackingNumber,
      carrier: "OTHER",
      carrier_name_other: carrierName.slice(0, 64),
      notify_payer: false,
    },
  });
  return { trackingNumber, carrier: carrierName, addedAt: Date.now() };
}

/**
 * Refund a capture. Without `partial` the whole (remaining) amount is refunded;
 * with it, only that amount — used by price protection to pay back a price drop.
 * `key` makes each partial refund idempotent (same key → same refund, never twice).
 */
export async function refundCapture(
  captureId: string,
  note: string,
  partial?: { value: string; currency: string; key: string },
): Promise<{ id: string; status: string; amount?: string; currency?: string }> {
  if (!/^[A-Z0-9]{10,25}$/.test(captureId)) throw new PayPalError("Invalid capture id", 400);
  if (partial && !(/^\d+(\.\d{1,2})?$/.test(partial.value) && Number(partial.value) > 0)) {
    throw new PayPalError("Invalid refund amount", 400, "INVALID_AMOUNT");
  }
  const r = await pp<{ id: string; status: string; amount?: { value: string; currency_code: string } }>(
    `/v2/payments/captures/${pid(captureId)}/refund`,
    {
      method: "POST",
      requestId: (partial ? `dalil-pp-${captureId}-${partial.key}` : `dalil-refund-${captureId}`).slice(0, 108),
      body: {
        note_to_payer: note.slice(0, 255),
        ...(partial ? { amount: { value: partial.value, currency_code: partial.currency } } : {}),
      },
    },
  );
  return { id: r.id, status: r.status, amount: r.amount?.value ?? partial?.value, currency: r.amount?.currency_code ?? partial?.currency };
}
