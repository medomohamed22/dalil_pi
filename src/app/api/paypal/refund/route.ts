import { z } from "zod";
import { refundCapture } from "@/lib/server/paypal";
import { errorResponse } from "@/lib/server/http";
import { checkCaptureToken } from "@/lib/server/sign";
import { rateLimit } from "@/lib/server/ratelimit";
import { endProtectionForCapture } from "@/lib/server/protection";

export const runtime = "nodejs";

const Body = z.object({
  captureId: z.string(),
  captureToken: z.string(),
  reason: z.enum(["not_received", "damaged", "not_as_described", "cancelled"]),
});

const NOTE: Record<z.infer<typeof Body>["reason"], string> = {
  not_received: "Refund from Dalil: item not received.",
  damaged: "Refund from Dalil: item arrived damaged.",
  not_as_described: "Refund from Dalil: item not as described.",
  cancelled: "Refund from Dalil: you cancelled this store within the cancel window.",
};

/** Order problem → refund the captured payment through PayPal. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "refund", 15, 600);
  if (limited) return limited;
  try {
    const b = Body.parse(await req.json());
    checkCaptureToken(b.captureToken, b.captureId);
    const r = await refundCapture(b.captureId, NOTE[b.reason]);
    // Nothing left to protect once the purchase is refunded in full.
    await endProtectionForCapture(b.captureId).catch(() => undefined);
    return Response.json(r);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return errorResponse(err);
  }
}
