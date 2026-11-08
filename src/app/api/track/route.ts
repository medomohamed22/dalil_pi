import { z } from "zod";
import { geoFromRequest } from "@/lib/server/geo";
import { rateLimit } from "@/lib/server/ratelimit";
import { readSession } from "@/lib/server/session";
import { recordClick } from "@/lib/server/stats";

export const runtime = "nodejs";

const Body = z.object({
  store: z.string().min(1).max(80),
  url: z.string().url().max(500).refine((u) => /^https?:\/\//.test(u)).optional(),
  title: z.string().max(200).optional(),
  kind: z.enum(["visit", "order"]),
  country: z.string().length(2).optional(),
});

/** A visit or order Dalil Pi sent to a store (sent with keepalive when the link opens). Guests too. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "track", 60, 60);
  if (limited) return limited;
  try {
    const b = Body.parse(await req.json());
    await recordClick({ ...b, country: b.country?.toUpperCase() ?? geoFromRequest(req).country, uid: readSession(req)?.uid });
    return new Response(null, { status: 204 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
