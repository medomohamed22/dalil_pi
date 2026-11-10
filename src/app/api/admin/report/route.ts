import { requireAdmin } from "@/lib/server/admin";
import { monthReport, reportCsv } from "@/lib/server/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Monthly report per store: GET ?month=YYYY-MM[&format=csv]. Admin token only. */
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const month = u.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  try {
    const r = await monthReport(month);
    if (u.searchParams.get("format") === "csv") {
      return new Response(reportCsv(r), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="dalil-pi-report-${r.month}.csv"`, "Cache-Control": "no-store" } });
    }
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const e = err as Error & { status?: number };
    return Response.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
