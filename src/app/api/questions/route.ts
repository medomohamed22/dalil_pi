import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { askShop, myQuestions } from "@/lib/server/community";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Questions I asked shops, with their answers. */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json({ questions: await myQuestions(s.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

/** Ask a registered shop (e.g. "Is size 42 available?"). */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "questions", 15, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const b = z.object({ merchantId: z.string().uuid(), question: z.string().min(3).max(500) }).parse(await req.json());
    await askShop(s.uid, b.merchantId, b.question);
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
