import { z } from "zod";
import { familyAction, familyFail } from "@/lib/server/family";
import { deviceOf } from "@/lib/server/group-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ action: z.enum(["decline", "cancel", "capture"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "family-act", 30, 600);
  if (limited) return limited;
  try {
    const { id } = await params;
    const b = Body.parse(await req.json());
    return Response.json({ request: await familyAction(id, deviceOf(req), b.action) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return familyFail(e);
  }
}
