import { errorJson, requireSession } from "@/lib/server/api";
import { createLink, linkStatus, unlink } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json(await linkStatus(s.uid), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

/** A one-time link that opens the bot and connects this account. */
export async function POST(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json({ url: await createLink(s.uid) });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    await unlink(s.uid);
    return Response.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
