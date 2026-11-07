import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { completePayment } from "@/lib/server/billing";
import { rateLimit } from "@/lib/server/ratelimit";
import { getUsage } from "@/lib/server/users";

export const runtime = "nodejs";

const Body = z.object({ paymentId: z.string().min(6).max(128), txid: z.string().min(8).max(200).optional() });

export async function POST(req: Request) {
  const limited = await rateLimit(req, "payments", 30, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const body = Body.parse(await req.json());
    const plan = await completePayment(s.uid, body.paymentId, body.txid);
    return Response.json({ ok: true, plan, usage: await getUsage(s.uid) });
  } catch (err) {
    return errorJson(err);
  }
}
