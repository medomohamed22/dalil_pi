import "server-only";
import { visitorId } from "./hosted";
import { counters, storePersistent } from "./store";

/**
 * Fixed-window rate limit per visitor (IP hash) and bucket.
 *
 * 1. The instance's own memory answers first (free, stops a burst on one instance at once).
 * 2. Then one shared counter in the database (`incr_counter`) counts the visitor's requests on
 *    every instance together, so spreading a flood over several warm instances doesn't multiply
 *    the limit. If the database is slow or down, the memory count alone decides (fail open).
 */
const g = globalThis as unknown as { __dalilRl?: Map<string, { n: number; exp: number }> };
const hits = (g.__dalilRl ??= new Map());
const SHARED_TIMEOUT_MS = 400;

function tooMany(retrySec: number): Response {
  return Response.json(
    { error: "Too many requests — please slow down and try again shortly.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retrySec)) } },
  );
}

async function sharedCount(key: string, windowSec: number): Promise<number | null> {
  if (!storePersistent) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      counters.incr(key, windowSec),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SHARED_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function rateLimit(req: Request, bucket: string, limit: number, windowSec: number): Promise<Response | null> {
  const now = Date.now();
  const visitor = visitorId(req);
  const key = `${bucket}:${visitor}`;
  const cur = hits.get(key);
  const next = !cur || cur.exp < now ? { n: 1, exp: now + windowSec * 1000 } : { n: cur.n + 1, exp: cur.exp };
  hits.set(key, next);
  if (hits.size > 20_000) for (const [k, v] of hits) if (v.exp < now) hits.delete(k);
  if (next.n > limit) return tooMany(Math.ceil((next.exp - now) / 1000));

  // Same window on every instance: the key carries the window number.
  const win = Math.floor(now / (windowSec * 1000));
  const shared = await sharedCount(`rl:${bucket}:${visitor}:${win}`, windowSec + 5);
  if (shared != null && shared > limit) return tooMany(Math.ceil(((win + 1) * windowSec * 1000 - now) / 1000));
  return null;
}
