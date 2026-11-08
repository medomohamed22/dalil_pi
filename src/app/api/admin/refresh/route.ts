import { requireAdmin } from "@/lib/server/admin";
import { refreshCatalog, SOURCES, type CatalogSource } from "@/lib/server/catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-read one store's catalog now: POST ?source=pcm|salla|gtp|pkt */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const source = new URL(req.url).searchParams.get("source") as CatalogSource | null;
  if (!source || !SOURCES.includes(source)) return Response.json({ error: "Bad source" }, { status: 400 });
  const results = await refreshCatalog({ force: true, sources: [source] });
  return Response.json({ result: results.find((r) => r.source === source) });
}
