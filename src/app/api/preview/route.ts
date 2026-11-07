import { browse } from "@/lib/server/browse";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Link preview for URLs the user pastes (OpenGraph / JSON-LD). */
export async function GET(req: Request) {
  const limited = await rateLimit(req, "preview", 60, 600);
  if (limited) return limited;
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return Response.json({ error: "missing url" }, { status: 400 });
  try {
    const r = await browse(url);
    return Response.json(r.preview, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    let site = url;
    try {
      site = new URL(url).hostname;
    } catch {}
    return Response.json({ url, site });
  }
}
