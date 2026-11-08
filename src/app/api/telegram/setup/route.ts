import { telegramConfigured, tg } from "@/lib/server/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time setup after adding the bot token in Vercel: registers the webhook and
 * the bot commands. Call: GET /api/telegram/setup with "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!telegramConfigured() || !process.env.TELEGRAM_WEBHOOK_SECRET) return Response.json({ error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET" }, { status: 503 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  try {
    await tg("setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true });
    await tg("setMyCommands", { commands: [{ command: "start", description: "Connect Dalil Pi · اربط دليل باي" }, { command: "stop", description: "Turn off notifications · إيقاف الإشعارات" }] });
    return Response.json({ ok: true, webhook: `${origin}/api/telegram/webhook` });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
