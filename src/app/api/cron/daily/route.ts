import { supabase, supabaseEnabled } from "@/lib/server/supabase";
import { sendDigest } from "@/lib/server/telegram";
import { checkWatches } from "@/lib/server/watches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily housekeeping (Vercel Cron, see vercel.json):
 *  - deletes expired rate-limit counters (keeps the free 500 MB database small),
 *  - marks 30-day packs whose time is up as expired,
 *  - re-checks watched products and flags price drops / target prices,
 *  - sends each Telegram-linked user a digest of what's new,
 *  - and, by touching the database every day, keeps a free Supabase project
 *    from being paused for inactivity.
 * Vercel sends "Authorization: Bearer $CRON_SECRET"; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Price-drop check for watched products (plain fetch, 5 at a time).
  const watches = await checkWatches().catch((e: Error) => ({ checked: 0, drops: 0, error: e.message }));
  // Then tell linked users on Telegram what's new — without them opening the site.
  const telegram = await sendDigest().catch((e: Error) => ({ users: 0, sent: 0, error: e.message }));
  if (!supabaseEnabled) return Response.json({ ok: true, database: false, watches, telegram });
  const db = supabase();
  const [counters, packs] = await Promise.all([db.rpc("purge_counters"), db.rpc("expire_packs"), db.rpc("purge_clicks")]);
  const errors = [counters.error?.message, packs.error?.message].filter(Boolean);
  return Response.json({ ok: !errors.length, expiredPacks: packs.data ?? 0, watches, telegram, errors }, { status: errors.length ? 500 : 200 });
}
