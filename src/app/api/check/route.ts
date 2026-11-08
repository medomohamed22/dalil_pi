import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { checkStore } from "@/lib/server/check";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** "Is this store safe?" for any shop link or name. Free (not counted as a search). */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "check", 20, 600);
  if (limited) return limited;
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { input } = z.object({ input: z.string().trim().min(3).max(300) }).parse(await req.json());
    return Response.json(await checkStore(input));
  } catch (err) {
    return errorJson(err);
  }
}
