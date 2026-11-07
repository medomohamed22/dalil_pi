import { z } from "zod";
import { verifyOffer } from "@/lib/server/sign";
import { storePersistent } from "@/lib/server/store";
import { createWatch, getVault, listWatches } from "@/lib/server/watches";
import { device, fail } from "@/lib/server/watch-http";
import { pushConfigured } from "@/lib/server/push";
import type { Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const d = device(req);
    return Response.json({
      watches: await listWatches(d),
      vaultConnected: !!(await getVault(d)),
      persistent: storePersistent,
      push: pushConfigured,
    });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.object({
  offer: z.object({ sig: z.string() }).passthrough(),
  targetPrice: z.number().positive(),
  mode: z.enum(["notify", "auto"]),
  maxSpend: z.number().min(0),
  market: z.enum(["EG", "US"]),
  demo: z.boolean(),
});

export async function POST(req: Request) {
  const limited = await rateLimit(req, "watch-new", 30, 3600);
  if (limited) return limited;
  try {
    const d = device(req);
    const b = Body.parse(await req.json());
    const offer = b.offer as unknown as Offer;
    if (!verifyOffer(offer)) return Response.json({ error: "Offer could not be verified", code: "OFFER_TAMPERED_OR_EXPIRED" }, { status: 400 });
    if (offer.flags?.includes("price_unverified")) return Response.json({ error: "This price couldn't be confirmed on the store page", code: "PRICE_UNVERIFIED" }, { status: 409 });
    const watch = await createWatch(d, { ...b, offer });
    return Response.json({ watch });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return fail(e);
  }
}
