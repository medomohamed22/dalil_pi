import { z } from "zod";
import { getProtection, protectionAction } from "@/lib/server/protection";
import { device, fail } from "@/lib/server/watch-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return Response.json({ protection: await getProtection(device(req), id) });
  } catch (e) {
    return fail(e);
  }
}

const Body = z.object({ action: z.enum(["simulate", "check"]), price: z.number().positive().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "protect-act", 30, 600);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    return Response.json({ protection: await protectionAction(device(req), id, b.action, { price: b.price }) });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return fail(e);
  }
}
