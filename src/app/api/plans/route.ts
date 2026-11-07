import { requireSession } from "@/lib/server/api";
import { planOffers } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paid plans with live Pi prices (OKX) and a signed quote for this user. */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  return Response.json(await planOffers(s.uid), { headers: { "Cache-Control": "no-store" } });
}
