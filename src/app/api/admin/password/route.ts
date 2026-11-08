import { z } from "zod";
import { requireAdmin, setAdminPassword } from "@/lib/server/admin";

export const runtime = "nodejs";

/** Set / change the admin password (stored as a scrypt hash in the database). */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { password } = z.object({ password: z.string().min(8).max(200) }).parse(await req.json());
    await setAdminPassword(password);
    return Response.json({ ok: true });
  } catch (err) {
    const e = err as { status?: number; message: string };
    return Response.json({ error: e.message }, { status: e.status ?? 400 });
  }
}
