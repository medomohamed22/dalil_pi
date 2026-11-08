import { errorJson, requireSession } from "@/lib/server/api";
import { removeWatch } from "@/lib/server/watches";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
    await removeWatch(s.uid, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
