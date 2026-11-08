import { requireAdmin } from "@/lib/server/admin";
import { catalogStats } from "@/lib/server/catalog";
import { adminStats } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner dashboard data. Needs an admin token (or ADMIN_SECRET / CRON_SECRET). */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  try {
    const [stats, catalog] = await Promise.all([adminStats(days), catalogStats("EG").catch(() => [])]);
    return Response.json({ ...stats, catalog }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
