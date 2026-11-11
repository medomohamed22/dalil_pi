import { requireAdmin } from "@/lib/server/admin";
import { dbUsage, supabase, supabaseEnabled } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin "performance": database calls of the instance that answers (since it started) and the
 * database's own counters per table (writes, reads, size). Counts and timings only.
 */
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const u = dbUsage();
  const by = Object.entries(u.by)
    .map(([name, v]) => ({ name, calls: v.calls, avgMs: Math.round(v.ms / v.calls) }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 20);
  let db: unknown = null;
  if (supabaseEnabled) {
    const { data, error } = await supabase().rpc("admin_db_stats");
    db = error ? { error: error.message } : data;
  }
  return Response.json(
    { instance: { upMin: Math.round((Date.now() - u.since) / 60_000), calls: u.calls, avgMs: u.calls ? Math.round(u.ms / u.calls) : 0, errors: u.errors, by }, db },
    { headers: { "Cache-Control": "no-store" } },
  );
}
