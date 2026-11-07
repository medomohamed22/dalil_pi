import "server-only";
import { visitorId } from "./hosted";
import { kv } from "./store";

/**
 * Fixed-window rate limit per visitor (IP hash) and bucket. Returns a 429
 * response when the visitor is over the limit, otherwise null. Fails open if
 * the store is down — a limiter outage must not take checkout down with it.
 */
export async function rateLimit(req: Request, bucket: string, limit: number, windowSec: number): Promise<Response | null> {
  const win = Math.floor(Date.now() / 1000 / windowSec);
  try {
    const n = await kv.incr(`rl:${bucket}:${visitorId(req)}:${win}`, windowSec + 5);
    if (n <= limit) return null;
  } catch {
    return null;
  }
  const retry = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
  return Response.json(
    { error: "Too many requests — please slow down and try again shortly.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(retry) } },
  );
}
