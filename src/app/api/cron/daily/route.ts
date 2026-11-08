import { supabase, supabaseEnabled } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily housekeeping (Vercel Cron, see vercel.json):
 *  - deletes expired rate-limit counters (keeps the free 500 MB database small),
 *  - marks 30-day packs whose time is up as expired,
 *  - and, by touching the database every day, keeps a free Supabase project
 *    from being paused for inactivity.
 * Vercel sends "Authorization: Bearer $CRON_SECRET"; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseEnabled) return Response.json({ ok: true, database: false });
  const db = supabase();
  const [counters, packs] = await Promise.all([db.rpc("purge_counters"), db.rpc("expire_packs")]);
  const errors = [counters.error?.message, packs.error?.message].filter(Boolean);
  return Response.json({ ok: !errors.length, expiredPacks: packs.data ?? 0, errors }, { status: errors.length ? 500 : 200 });
}
