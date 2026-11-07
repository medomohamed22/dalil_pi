import { z } from "zod";
import { createGroup } from "@/lib/server/groups";
import { deviceOf, groupFail } from "@/lib/server/group-http";
import { verifyOffer } from "@/lib/server/sign";
import type { Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ offer: z.object({ sig: z.string() }).passthrough(), shares: z.number().int().min(2).max(6) });

/** Organizer starts a group buy for a signed offer. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "group-new", 10, 3600);
  if (limited) return limited;
  try {
    const device = deviceOf(req);
    if (!device) return Response.json({ error: "Missing device id" }, { status: 401 });
    const b = Body.parse(await req.json());
    const offer = b.offer as unknown as Offer;
    if (!verifyOffer(offer)) return Response.json({ error: "Offer could not be verified", code: "OFFER_TAMPERED_OR_EXPIRED" }, { status: 400 });
    if (offer.flags?.includes("price_unverified")) return Response.json({ error: "This price couldn't be confirmed on the store page", code: "PRICE_UNVERIFIED" }, { status: 409 });
    return Response.json({ group: await createGroup(device, offer, b.shares) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return groupFail(e);
  }
}
