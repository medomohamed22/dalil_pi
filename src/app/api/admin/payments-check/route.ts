import { requireAdmin } from "@/lib/server/admin";
import { reconcilePayments } from "@/lib/server/billing";
import { kvSet } from "@/lib/server/kv";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Run the daily payment check now (owner panel or a script with CRON_SECRET). */
export async function POST(req: Request) {
  const denied = await requireAdmin(req, { scripts: true });
  if (denied) return denied;
  try {
    const r = await reconcilePayments();
    await kvSet("payments_check", r).catch(() => {});
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
