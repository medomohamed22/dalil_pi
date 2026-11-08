import { z } from "zod";
import { adminLogin, passwordIsSet } from "@/lib/server/admin";
import { visitorId } from "@/lib/server/hosted";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: is a password set yet? POST { password } → admin token (12 h). Wrong passwords are counted in the database (admin.ts). */
export async function GET() {
  return Response.json({ passwordSet: await passwordIsSet() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, "admin-login", 8, 600);
  if (limited) return limited;
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(await req.json().catch(() => ({})));
  let r: Awaited<ReturnType<typeof adminLogin>>;
  try {
    r = await adminLogin(password, visitorId(req));
  } catch (err) {
    const e = err as { status?: number; message: string };
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
  if (!r) return Response.json({ error: "Wrong password" }, { status: 401 });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
