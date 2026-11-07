import { cancelGroup } from "@/lib/server/groups";
import { deviceOf, groupFail } from "@/lib/server/group-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Organizer cancels: every held share is voided. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "group-cancel", 30, 600);
  if (limited) return limited;
  try {
    const { id } = await params;
    const device = deviceOf(req);
    if (!device) return Response.json({ error: "Missing device id" }, { status: 401 });
    return Response.json({ group: await cancelGroup(id, device) });
  } catch (e) {
    return groupFail(e);
  }
}
