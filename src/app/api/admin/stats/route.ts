import { catalogStats } from "@/lib/server/catalog";
import { adminStats } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner dashboard data. Needs "Authorization: Bearer <ADMIN_SECRET or CRON_SECRET>". */
export async function GET(req: Request) {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "ADMIN_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  try {
    const [stats, catalog] = await Promise.all([adminStats(days), catalogStats("EG").catch(() => [])]);
    return Response.json({ ...stats, catalog }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
