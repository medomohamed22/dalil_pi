import { familyFail, startApproval } from "@/lib/server/family";
import { deviceOf } from "@/lib/server/group-http";
import { originOf } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** The approver starts paying from their own PayPal account. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "family-pay", 30, 600);
  if (limited) return limited;
  try {
    const { id } = await params;
    return Response.json(await startApproval(id, deviceOf(req), originOf(req)));
  } catch (e) {
    return familyFail(e);
  }
}
