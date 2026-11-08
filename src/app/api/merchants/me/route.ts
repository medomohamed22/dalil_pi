import { errorJson, requireSession } from "@/lib/server/api";
import { getMyMerchant, MerchantInput, saveMyMerchant } from "@/lib/server/merchants";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's shop on "Dalil Pi for merchants" (null if none). */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json({ merchant: await getMyMerchant(s.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

/** Register or update the shop (goes to review). */
export async function PUT(req: Request) {
  const limited = await rateLimit(req, "merchants", 10, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const input = MerchantInput.parse(await req.json());
    return Response.json({ merchant: await saveMyMerchant(s.uid, input) });
  } catch (err) {
    return errorJson(err);
  }
}
