import { z } from "zod";
import { createProtection, listProtections } from "@/lib/server/protection";
import { checkCaptureToken, verifyOffer } from "@/lib/server/sign";
import { device, fail } from "@/lib/server/watch-http";
import { TokenError } from "@/lib/server/sign";
import type { Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    return Response.json({ protections: await listProtections(device(req)) });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.object({
  captureId: z.string().regex(/^[A-Z0-9]{10,25}$/),
  captureToken: z.string(),
  offer: z.object({ sig: z.string() }).passthrough(),
  demo: z.boolean().optional(),
});

/**
 * Turn on price protection for a purchase this browser captured. The capture
 * token proves ownership; the signed offer is the price that was paid.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "protect-new", 30, 3600);
  if (limited) return limited;
  try {
    const d = device(req);
    const b = Body.parse(await req.json());
    const { orderId } = checkCaptureToken(b.captureToken, b.captureId);
    const offer = b.offer as unknown as Offer;
    // Offers are signed for 24h; a purchase is captured within minutes of approval.
    if (!verifyOffer(offer)) return Response.json({ error: "Offer could not be verified", code: "OFFER_TAMPERED_OR_EXPIRED" }, { status: 400 });
    const protection = await createProtection(d, { captureId: b.captureId, orderId, offer, demo: !!b.demo });
    return Response.json({ protection });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    if (e instanceof TokenError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    return fail(e);
  }
}
