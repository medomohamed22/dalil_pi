import { handleUpdate, telegramConfigured } from "@/lib/server/telegram";

export const runtime = "nodejs";

/** Telegram → Dalil Pi. Only requests carrying our secret header are accepted. */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!telegramConfigured() || !secret) return Response.json({ ok: false }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) return Response.json({ ok: false }, { status: 401 });
  try {
    await handleUpdate(await req.json());
  } catch {
    /* always 200 so Telegram doesn't retry forever */
  }
  return Response.json({ ok: true });
}
