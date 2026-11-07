import { runAll } from "@/lib/server/watches";
import { expireGroups } from "@/lib/server/groups";
import { runProtections } from "@/lib/server/protection";
import { sweepFamily } from "@/lib/server/family";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Checks every price watch. Vercel Cron (daily on Hobby) calls this with
 * `Authorization: Bearer $CRON_SECRET`; .github/workflows/price-watch.yml calls it
 * every 10 minutes from GitHub Actions with the same header.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const result = await runAll();
  const groupsExpired = await expireGroups().catch(() => 0);
  const protection = await runProtections().catch(() => ({ checked: 0, refunded: 0 }));
  const family = await sweepFamily().catch(() => ({ captured: 0, expired: 0 }));
  return Response.json({ ...result, groupsExpired, protection, family, ms: Date.now() - started });
}
