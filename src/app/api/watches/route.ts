import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/ratelimit";
import { addWatch, listWatches, markDropsSeen } from "@/lib/server/watches";
import type { Offer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's watchlist. `?seen=1` also clears the "price dropped" flags. */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const watches = await listWatches(s.uid);
    if (new URL(req.url).searchParams.get("seen") === "1") await markDropsSeen(s.uid);
    return Response.json({ watches }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

const Body = z.object({
  offer: z.object({ sig: z.string(), title: z.string(), store: z.string(), price: z.number(), currency: z.string() }).passthrough(),
  targetPrice: z.number().positive().max(10_000_000).nullish(),
});

/** Watch a product from a (server-signed) card. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "watches", 30, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const body = Body.parse(await req.json());
    return Response.json({ watch: await addWatch(s.uid, body.offer as unknown as Offer, body.targetPrice) }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
