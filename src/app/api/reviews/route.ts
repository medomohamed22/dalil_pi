import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { addReview } from "@/lib/server/community";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** A buyer reviews the store of one of their own paid orders. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "reviews", 20, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const b = z.object({ orderId: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().max(500).nullish() }).parse(await req.json());
    await addReview(s.uid, b.orderId, b.rating, b.comment);
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
