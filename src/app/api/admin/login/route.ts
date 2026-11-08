import { z } from "zod";
import { adminLogin, passwordIsSet } from "@/lib/server/admin";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: is a password set yet? POST { password } → admin token (12 h). 8 tries per 10 min per visitor. */
export async function GET() {
  return Response.json({ passwordSet: await passwordIsSet() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, "admin-login", 8, 600);
  if (limited) return limited;
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(await req.json().catch(() => ({})));
  const r = await adminLogin(password);
  if (!r) return Response.json({ error: "Wrong password" }, { status: 401 });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
