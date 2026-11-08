import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { setSetting, siteSettings } from "@/lib/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  featured: z.object({ store: z.string().max(20), cats: z.string().max(120), title_en: z.string().max(60), title_ar: z.string().max(60) }).optional(),
  hidden_stores: z.array(z.string().max(30)).max(30).optional(),
  announcement: z.object({ on: z.boolean(), en: z.string().max(200), ar: z.string().max(200) }).optional(),
});

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return Response.json(await siteSettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const b = Body.parse(await req.json());
    for (const [k, v] of Object.entries(b)) if (v !== undefined) await setSetting(k, v);
    return Response.json(await siteSettings());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
