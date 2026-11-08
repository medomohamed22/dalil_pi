import "server-only";
import { visitorId } from "./hosted";

/**
 * Fixed-window rate limit per visitor (IP hash) and bucket, counted in the
 * server instance's memory — no database call per request. With Vercel Fluid
 * compute a few warm instances serve the traffic, so this is approximate but
 * good enough against bursts. The limits that must be exact (search quota,
 * hourly search limit, daily AI caps) stay in the database (begin_search).
 */
const g = globalThis as unknown as { __dalilRl?: Map<string, { n: number; exp: number }> };
const hits = (g.__dalilRl ??= new Map());

export async function rateLimit(req: Request, bucket: string, limit: number, windowSec: number): Promise<Response | null> {
  const now = Date.now();
  const key = `${bucket}:${visitorId(req)}`;
  const cur = hits.get(key);
  const next = !cur || cur.exp < now ? { n: 1, exp: now + windowSec * 1000 } : { n: cur.n + 1, exp: cur.exp };
  hits.set(key, next);
  if (hits.size > 20_000) for (const [k, v] of hits) if (v.exp < now) hits.delete(k);
  if (next.n <= limit) return null;
  return Response.json(
    { error: "Too many requests — please slow down and try again shortly.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(Math.ceil((next.exp - now) / 1000)) } },
  );
}
