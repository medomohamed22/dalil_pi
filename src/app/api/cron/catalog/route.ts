import { refreshCatalog, SOURCES, type CatalogSource } from "@/lib/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Refresh Dalil Index (the copy of trusted Pi stores' catalogs).
 * Called by Vercel Cron (daily) and, optionally, GitHub Actions (hourly).
 * Only stores whose copy is stale are read, unless ?force=1. ?source=pcm,gtp limits it.
 * Needs "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const sources = (u.searchParams.get("source") ?? "")
    .split(",")
    .filter((s): s is CatalogSource => (SOURCES as string[]).includes(s));
  const results = await refreshCatalog({ force: u.searchParams.get("force") === "1", sources: sources.length ? sources : undefined });
  const failed = results.filter((r) => r.status === "failed");
  return Response.json({ ok: !failed.length, results }, { status: failed.length && failed.length === results.length ? 500 : 200 });
}
