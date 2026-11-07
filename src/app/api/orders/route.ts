import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { createOrder, listOrders } from "@/lib/server/orders";
import { assertCanOrder, recordOrder } from "@/lib/server/users";
import type { Offer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's orders (newest first). */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json({ orders: await listOrders(s.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

const Body = z.object({
  /** A product card's offer, exactly as the server signed it. */
  offer: z.object({ sig: z.string(), title: z.string(), store: z.string(), price: z.number(), total: z.number(), currency: z.string() }).passthrough(),
  addressId: z.string().min(1).max(64).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
});

/**
 * "Order" on a product card: checks the monthly order quota, saves the order
 * (product + default address if any) and counts it. The client then opens the
 * product page in the store, where the user pays the store directly.
 */
export async function POST(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const body = Body.parse(await req.json());
    await assertCanOrder(s.uid);
    const order = await createOrder(s.uid, body.offer as unknown as Offer, body.addressId, body.quantity ?? 1);
    const usage = await recordOrder(s.uid);
    return Response.json({ order, usage }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
