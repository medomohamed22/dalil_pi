import { getVault, syncDevice } from "@/lib/server/watches";
import { device, fail } from "@/lib/server/watch-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Called by the open app every minute: checks this device's watches now. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "watch-sync", 120, 600);
  if (limited) return limited;
  try {
    const d = device(req);
    return Response.json({ watches: await syncDevice(d), vaultConnected: !!(await getVault(d)) });
  } catch (e) {
    return fail(e);
  }
}
