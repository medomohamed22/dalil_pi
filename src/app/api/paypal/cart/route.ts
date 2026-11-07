import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createCartOrder, PayPalError } from "@/lib/server/paypal";
import { orderToken, verifyOffer } from "@/lib/server/sign";
import { errorResponse, originOf } from "@/lib/server/http";
import type { Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

const Body = z.object({
  offers: z.array(z.object({ sig: z.string() }).passthrough()).min(1).max(10),
  mandate: z.object({ maxSpend: z.number().min(0), verifiedOnly: z.boolean() }),
});

/**
 * Multi-store cart: ONE PayPal order (intent AUTHORIZE) with one purchase unit
 * per store, approved once by the buyer. Every item is checked exactly like a
 * single purchase (signature, price grounding, trust) and the spending mandate
 * applies to the cart's grand total — all in server code.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "order", 30, 600);
  if (limited) return limited;
  try {
    const { offers: raw, mandate } = Body.parse(await req.json());
    const offers = raw as unknown as Offer[];

    const seen = new Set<string>();
    for (const o of offers) {
      if (!verifyOffer(o)) {
        throw new PayPalError(`"${String(o.title).slice(0, 60)}" could not be verified. Ask Dalil to search again.`, 400, "OFFER_TAMPERED_OR_EXPIRED");
      }
      if (seen.has(o.id)) throw new PayPalError("The same offer is in the cart twice", 400, "CART_DUPLICATE");
      seen.add(o.id);
      if (o.flags?.includes("price_unverified")) {
        throw new PayPalError(`Dalil couldn't confirm the price of "${o.title.slice(0, 60)}" on the store's page.`, 409, "PRICE_UNVERIFIED");
      }
      if (o.trust === "suspicious") throw new PayPalError(`Blocked: ${o.store} looks suspicious.`, 403, "MANDATE_SUSPICIOUS_STORE");
      if (mandate.verifiedOnly && o.trust !== "verified") {
        throw new PayPalError(`Blocked by your mandate: ${o.store} is not a verified store.`, 403, "MANDATE_UNVERIFIED_STORE");
      }
    }
    const currency = offers[0].currency;
    if (offers.some((o) => o.currency !== currency)) {
      throw new PayPalError("All items in one cart must be in the same currency", 400, "CART_MIXED_CURRENCY");
    }

    // Group by store: one purchase unit (and one hold) per store; shipping per store
    // is the highest shipping quoted by that store's offers (charged once).
    const byStore = new Map<string, Offer[]>();
    for (const o of offers) byStore.set(o.store, [...(byStore.get(o.store) ?? []), o]);
    const cartId = randomBytes(6).toString("hex");
    const units = [...byStore.entries()].map(([store, list], i) => ({
      referenceId: `c${cartId}-${i + 1}`,
      store,
      shipping: Math.max(...list.map((o) => o.shipping ?? 0)),
      items: list.map((o) => ({ title: o.title, price: o.price, url: o.url })),
    }));
    const total = Math.round(units.reduce((a, u) => a + u.shipping + u.items.reduce((b, it) => b + it.price, 0), 0) * 100) / 100;
    if (mandate.maxSpend > 0 && total > mandate.maxSpend) {
      throw new PayPalError(`Blocked by your mandate: cart total ${total} ${currency} is above your limit of ${mandate.maxSpend}.`, 403, "MANDATE_OVER_LIMIT");
    }

    const origin = originOf(req);
    const order = await createCartOrder({
      cartId,
      units,
      currency,
      returnUrl: `${origin}/paypal/return`,
      cancelUrl: `${origin}/paypal/cancel`,
    });
    return Response.json({
      ...order,
      total,
      currency,
      units: units.map((u) => ({
        referenceId: u.referenceId,
        store: u.store,
        shipping: u.shipping,
        items: u.items.map((it) => it.title),
        charge: order.units.find((x) => x.referenceId === u.referenceId)?.value,
      })),
      orderToken: orderToken(order.id),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
