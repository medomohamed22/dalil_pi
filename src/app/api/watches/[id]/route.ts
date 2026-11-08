import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { removeWatch, setTarget } from "@/lib/server/watches";

export const runtime = "nodejs";

const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { id } = await ctx.params;
    if (!idOk(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
    await removeWatch(s.uid, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}

const Patch = z.object({ targetPrice: z.number().positive().max(10_000_000).nullable() });

/** Set or clear the alert price. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { id } = await ctx.params;
    if (!idOk(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
    const body = Patch.parse(await req.json());
    await setTarget(s.uid, id, body.targetPrice);
    return Response.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
