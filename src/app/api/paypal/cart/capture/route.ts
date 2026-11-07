import { captureCartOrder } from "@/lib/server/paypal";
import { errorResponse } from "@/lib/server/http";
import { captureToken, checkOrderToken } from "@/lib/server/sign";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The buyer approved the multi-store cart on PayPal → capture it. Each store's
 * part comes back with its own capture token, so the browser that placed the
 * order (and only it) can cancel any store with a full refund.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "capture", 30, 600);
  if (limited) return limited;
  try {
    const { orderId, orderToken } = (await req.json()) as { orderId?: string; orderToken?: string };
    const id = String(orderId ?? "");
    checkOrderToken(orderToken, id);
    const r = await captureCartOrder(id);
    return Response.json({ ...r, units: r.units.map((u) => ({ ...u, captureToken: captureToken(u.captureId, r.orderId) })) });
  } catch (err) {
    return errorResponse(err);
  }
}
