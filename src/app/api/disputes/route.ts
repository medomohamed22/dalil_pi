import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { addDispute } from "@/lib/server/community";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** "Problem with my order" — lowers the store's trust score. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "disputes", 10, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const b = z.object({ orderId: z.string().uuid(), kind: z.enum(["not_delivered", "not_as_described", "scam", "other"]), details: z.string().max(1000).nullish() }).parse(await req.json());
    await addDispute(s.uid, b.orderId, b.kind, b.details);
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
