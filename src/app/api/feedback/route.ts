import { errorJson, requireSession } from "@/lib/server/api";
import { myOrderFeedback } from "@/lib/server/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Order ids the user already reviewed / reported. */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json(await myOrderFeedback(s.uid), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}
