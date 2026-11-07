import { confirmShare } from "@/lib/server/groups";
import { deviceOf, groupFail } from "@/lib/server/group-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** After PayPal approval: hold the share; captures everyone once the last share is held. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "group-confirm", 60, 600);
  if (limited) return limited;
  try {
    const { id } = await params;
    const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
    return Response.json({ group: await confirmShare(id, String(orderId ?? ""), deviceOf(req)) });
  } catch (e) {
    return groupFail(e);
  }
}
