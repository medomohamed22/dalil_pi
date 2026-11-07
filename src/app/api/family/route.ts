import { z } from "zod";
import { createFamily, familyFail } from "@/lib/server/family";
import { deviceOf } from "@/lib/server/group-http";
import { verifyOffer } from "@/lib/server/sign";
import type { Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

const Body = z.object({
  offer: z.object({ sig: z.string() }).passthrough(),
  limit: z.number().positive(),
  name: z.string().max(80).default(""),
  note: z.string().max(400).optional(),
});

/** The requester asks a family member to approve & pay a signed offer, up to a limit. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "family-new", 15, 3600);
  if (limited) return limited;
  try {
    const device = deviceOf(req);
    if (!device) return Response.json({ error: "Missing device id" }, { status: 401 });
    const b = Body.parse(await req.json());
    const offer = b.offer as unknown as Offer;
    if (!verifyOffer(offer)) return Response.json({ error: "Offer could not be verified", code: "OFFER_TAMPERED_OR_EXPIRED" }, { status: 400 });
    if (offer.flags?.includes("price_unverified")) return Response.json({ error: "This price couldn't be confirmed on the store page", code: "PRICE_UNVERIFIED" }, { status: 409 });
    return Response.json({ request: await createFamily(device, { offer, limit: b.limit, name: b.name, note: b.note }) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return familyFail(e);
  }
}
