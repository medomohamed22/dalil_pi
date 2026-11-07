import { authorizeOrder } from "@/lib/server/paypal";
import { errorResponse } from "@/lib/server/http";
import { checkOrderToken, holdToken } from "@/lib/server/sign";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Buyer approved on PayPal → place a hold (authorization). Nothing is charged yet. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "authorize", 30, 600);
  if (limited) return limited;
  try {
    const { orderId, orderToken } = (await req.json()) as { orderId?: string; orderToken?: string };
    // Only the browser that created this order may place (or re-read) its hold.
    checkOrderToken(orderToken, String(orderId ?? ""));
    const a = await authorizeOrder(String(orderId ?? ""));
    // The token proves this browser placed the hold — required to capture or void it.
    return Response.json({
      ...a,
      holdToken: holdToken(a.authorizationId, a.orderId),
      // A multi-store cart has one hold per store, each with its own token.
      units: a.units.map((u) => ({ ...u, holdToken: holdToken(u.authorizationId, a.orderId) })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
