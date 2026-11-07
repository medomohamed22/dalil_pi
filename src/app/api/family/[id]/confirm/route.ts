import { confirmApproval, familyFail } from "@/lib/server/family";
import { deviceOf } from "@/lib/server/group-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** After PayPal approval: hold the approver's funds (10-minute cancel window). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "family-confirm", 60, 600);
  if (limited) return limited;
  try {
    const { id } = await params;
    const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
    return Response.json({ request: await confirmApproval(id, String(orderId ?? ""), deviceOf(req)) });
  } catch (e) {
    return familyFail(e);
  }
}
