import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { answerQuestion, inbox } from "@/lib/server/community";
import { getMyMerchant } from "@/lib/server/merchants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Questions buyers asked my shop. */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const m = await getMyMerchant(s.uid);
    return Response.json({ questions: m ? await inbox(m.id) : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

/** Answer one (the buyer gets it on Telegram in the daily digest and in the app). */
export async function POST(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const b = z.object({ id: z.string().uuid(), answer: z.string().min(1).max(800) }).parse(await req.json());
    const m = await getMyMerchant(s.uid);
    if (!m) return Response.json({ error: "No shop" }, { status: 404 });
    await answerQuestion(m.id, b.id, b.answer);
    return Response.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
