import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { createOrder, listOrders } from "@/lib/server/orders";
import { rateLimit } from "@/lib/server/ratelimit";
import { getUsage, updateProfile } from "@/lib/server/users";
import type { Offer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's orders (newest first). */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    // 20 per page; ?limit= up to 100 for "show more".
    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 20));
    return Response.json({ orders: await listOrders(s.uid, limit) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

const Body = z.object({
  /** A product card's offer, exactly as the server signed it. */
  offer: z.object({ sig: z.string(), title: z.string(), store: z.string(), price: z.number(), total: z.number(), currency: z.string() }).passthrough(),
  addressId: z.string().min(1).max(64).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
  /** Place the order at the store automatically (stores with a Pi checkout). */
  auto: z.boolean().optional(),
  email: z.string().email().max(200).optional(),
});

/**
 * "Order" on a product card: saves the order (product + default address if any) — free, no
 * credit used. The client then opens the
 * product page in the store, where the user pays the store directly.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "orders", 30, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const body = Body.parse(await req.json());
    if (body.auto && !body.email) return Response.json({ error: "An email is needed for the store's receipt.", code: "EMAIL_REQUIRED" }, { status: 400 });
    if (body.auto && body.email) await updateProfile(s.uid, { email: body.email });
    const order = await createOrder(s.uid, body.offer as unknown as Offer, body.addressId, body.quantity ?? 1, body.auto ? { email: body.email! } : undefined);
    // Orders are free (only AI requests use credit); the order is still saved for the user and stats.
    const usage = await getUsage(s.uid).catch(() => undefined);
    return Response.json({ order, usage }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
