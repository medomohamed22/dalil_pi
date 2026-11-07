import { addTracking } from "@/lib/server/paypal";
import { errorResponse } from "@/lib/server/http";
import { checkCaptureToken } from "@/lib/server/sign";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/**
 * Hackathon sandbox: Dalil acts as the merchant of record, so it "ships" the order
 * and registers tracking on the PayPal order (Orders v2 /track).
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "track", 30, 600);
  if (limited) return limited;
  try {
    const { captureId, captureToken, store } = (await req.json()) as { captureId?: string; captureToken?: string; store?: string };
    const id = String(captureId ?? "");
    const { orderId } = checkCaptureToken(captureToken, id);
    return Response.json(await addTracking(orderId, id, `${String(store ?? "Dalil").slice(0, 60)} Delivery`));
  } catch (err) {
    return errorResponse(err);
  }
}
