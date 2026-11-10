import "server-only";
import { randomBytes } from "node:crypto";
import { markAnswersNotified, pendingAnswers } from "./community";
import { fetchWithTimeout } from "./net";
import { supabase, supabaseEnabled } from "./supabase";
import { markWatchesNotified, pendingWatchAlerts } from "./watches";

/**
 * Telegram bot notifications (the Pi Browser has no push notifications).
 *  - Link: the app gives a one-time https://t.me/<bot>?start=<code> link (15 min).
 *    The bot receives "/start <code>" on its webhook and stores the chat id.
 *  - Daily digest (Vercel Cron): price drops, target prices reached, shop answers,
 *    plans ending soon — sent without the user opening Dalil Pi.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET.
 */
export function telegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}
const API = () =>
  (!process.env.VERCEL && process.env.TELEGRAM_API_BASE) /* tests only */ || `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export async function tg<T = unknown>(method: string, body: unknown): Promise<T> {
  const r = await fetchWithTimeout(`${API()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), timeoutMs: 10_000 });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? r.status}`);
  return j.result as T;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function send(chatId: number, html: string): Promise<void> {
  await tg("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });
}

/* ---- storage (Supabase or memory) ---- */
interface Link {
  pi_uid: string;
  chat_id: number | null;
  link_code: string | null;
  code_expires: string | null;
  linked_at: string | null;
  last_digest: string | null;
}
const mem = ((globalThis as unknown as { __dalilTg?: Link[] }).__dalilTg ??= []);

async function upsertLink(row: Partial<Link> & { pi_uid: string }) {
  if (!supabaseEnabled) {
    const cur = mem.find((x) => x.pi_uid === row.pi_uid);
    if (cur) Object.assign(cur, row);
    else mem.push({ chat_id: null, link_code: null, code_expires: null, linked_at: null, last_digest: null, ...row });
    return;
  }
  const { error } = await supabase().from("telegram_links").upsert(row, { onConflict: "pi_uid" });
  if (error) throw new Error(error.message);
}

export async function linkStatus(uid: string): Promise<{ configured: boolean; linked: boolean }> {
  if (!telegramConfigured()) return { configured: false, linked: false };
  if (!supabaseEnabled) return { configured: true, linked: !!mem.find((x) => x.pi_uid === uid)?.chat_id };
  const { data } = await supabase().from("telegram_links").select("chat_id").eq("pi_uid", uid).maybeSingle();
  return { configured: true, linked: !!data?.chat_id };
}

/** One-time deep link to the bot (valid 15 minutes). */
export async function createLink(uid: string): Promise<string> {
  if (!telegramConfigured()) throw Object.assign(new Error("Telegram isn't set up yet"), { status: 503 });
  const code = randomBytes(18).toString("base64url"); // 24 chars, allowed in ?start=
  await upsertLink({ pi_uid: uid, link_code: code, code_expires: new Date(Date.now() + 15 * 60_000).toISOString() });
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}`;
}

export async function unlink(uid: string): Promise<void> {
  const link = await getLink(uid);
  if (link?.chat_id) await send(link.chat_id, "Dalil Pi notifications are off. 👋").catch(() => {});
  await upsertLink({ pi_uid: uid, chat_id: null, linked_at: null });
}

async function getLink(uid: string): Promise<Link | null> {
  if (!supabaseEnabled) return mem.find((x) => x.pi_uid === uid) ?? null;
  const { data } = await supabase().from("telegram_links").select("*").eq("pi_uid", uid).maybeSingle();
  return (data as Link) ?? null;
}

/** Webhook: "/start <code>" links the chat; "/stop" unlinks it. */
export async function handleUpdate(update: { message?: { chat?: { id?: number }; text?: string } }): Promise<void> {
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (!chatId || !text) return;
  const app = process.env.APP_URL || "https://dalilpi.vercel.app";
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (!code) return send(chatId, `👋 Welcome to <b>Dalil Pi</b>.\nOpen ${esc(app)} → My account → Notifications → "Connect Telegram" to link your account.\n\nافتح دليل باي ← حسابي ← الإشعارات ← "اربط تليجرام".`);
    let row: Link | null = null;
    if (!supabaseEnabled) row = mem.find((x) => x.link_code === code) ?? null;
    else row = ((await supabase().from("telegram_links").select("*").eq("link_code", code).maybeSingle()).data as Link) ?? null;
    if (!row || !row.code_expires || row.code_expires < new Date().toISOString()) return send(chatId, "⚠️ This link expired. Get a new one in Dalil Pi.\nاللينك انتهى، خد لينك جديد من دليل باي.");
    // One chat ↔ one account: free this chat from any other account first.
    if (!supabaseEnabled) mem.filter((x) => x.chat_id === chatId).forEach((x) => (x.chat_id = null));
    else await supabase().from("telegram_links").update({ chat_id: null }).eq("chat_id", chatId);
    await upsertLink({ pi_uid: row.pi_uid, chat_id: chatId, link_code: null, code_expires: null, linked_at: new Date().toISOString() });
    return send(chatId, "✅ <b>Connected!</b> You'll get price drops, target prices, shop answers and plan reminders here once a day.\n\n✅ <b>اتربط!</b> هيوصلك هنا نزول الأسعار، والسعر المستهدف، وردود المحلات، وتذكير الباقة مرة كل يوم.\n\n/stop — turn off · إيقاف");
  }
  if (text.startsWith("/stop")) {
    if (!supabaseEnabled) mem.filter((x) => x.chat_id === chatId).forEach((x) => (x.chat_id = null));
    else await supabase().from("telegram_links").update({ chat_id: null, linked_at: null }).eq("chat_id", chatId);
    return send(chatId, "🔕 Notifications off. · الإشعارات اتقفلت.");
  }
  return send(chatId, `Dalil Pi — ${esc(app)}\n/stop — turn off notifications · إيقاف الإشعارات`);
}

/* ---- daily digest ---- */
const money = (n: number, cur: string) => `${Math.round(n * 100) / 100} ${cur === "PI" ? "π" : cur}`;

/** One watch alert line (price drop or reached target). */
function watchLine(w: Awaited<ReturnType<typeof pendingWatchAlerts>>[number], ar: boolean): string {
  const hit = w.targetHit && w.targetPrice != null;
  return hit
    ? `🎯 ${ar ? "وصل للسعر اللي حددته" : "Reached your target"}: <b>${esc(w.title)}</b> — ${money(w.lastPrice, w.currency)} (${esc(w.store)})\n${esc(w.url)}`
    : `📉 ${ar ? "السعر نزل" : "Price dropped"}: <b>${esc(w.title)}</b> — ${money(w.price, w.currency)} → ${money(w.lastPrice, w.currency)} (${esc(w.store)})\n${esc(w.url)}`;
}

/** Right away (after a catalog refresh): only the price alerts of these users. */
export async function sendWatchAlerts(uids: string[]): Promise<{ sent: number }> {
  if (!telegramConfigured() || !uids.length) return { sent: 0 };
  let links: (Link & { lang?: string })[];
  if (!supabaseEnabled) links = mem.filter((x) => x.chat_id && uids.includes(x.pi_uid));
  else {
    const { data } = await supabase().from("telegram_links").select("*, users(lang)").in("pi_uid", uids.slice(0, 500)).not("chat_id", "is", null);
    links = ((data ?? []) as (Link & { users?: { lang?: string } })[]).map((l) => ({ ...l, lang: l.users?.lang }));
  }
  if (!links.length) return { sent: 0 };
  const watches = (await pendingWatchAlerts()).filter((w) => uids.includes(w.uid));
  const app = process.env.APP_URL || "https://dalilpi.vercel.app";
  let sent = 0;
  const done: string[] = [];
  for (const l of links) {
    const mine = watches.filter((w) => w.uid === l.pi_uid);
    if (!mine.length || !l.chat_id) continue;
    const ar = l.lang === "ar";
    try {
      await send(l.chat_id, `<b>Dalil Pi</b>\n\n${mine.map((w) => watchLine(w, ar)).join("\n\n")}\n\n${esc(app)}`);
      sent++;
      done.push(...mine.map((w) => w.id));
    } catch {
      /* blocked the bot — the daily digest tries again */
    }
  }
  await markWatchesNotified(done);
  return { sent };
}

export async function sendDigest(): Promise<{ users: number; sent: number }> {
  if (!telegramConfigured()) return { users: 0, sent: 0 };
  let links: (Link & { lang?: string })[];
  if (!supabaseEnabled) links = mem.filter((x) => x.chat_id);
  else {
    const { data } = await supabase().from("telegram_links").select("*, users(lang)").not("chat_id", "is", null).limit(5000);
    links = ((data ?? []) as (Link & { users?: { lang?: string } })[]).map((l) => ({ ...l, lang: l.users?.lang }));
  }
  if (!links.length) return { users: 0, sent: 0 };
  const [watches, answers] = await Promise.all([pendingWatchAlerts(), pendingAnswers()]);
  const app = process.env.APP_URL || "https://dalilpi.vercel.app";
  // Plans ending within 3 days (reminded once).
  let ending: { pi_uid: string; plan: string; ends_at: string }[] = [];
  if (supabaseEnabled) {
    const { data } = await supabase()
      .from("subscriptions")
      .select("pi_uid, plan, ends_at")
      .eq("status", "active")
      .neq("plan", "topup")
      .gt("ends_at", new Date().toISOString())
      .lt("ends_at", new Date(Date.now() + 3 * 864e5).toISOString());
    ending = data ?? [];
  }
  let sent = 0;
  const doneWatches: string[] = [];
  const doneAnswers: string[] = [];
  for (const l of links) {
    const ar = l.lang === "ar";
    const lines: string[] = [];
    for (const w of watches.filter((x) => x.uid === l.pi_uid)) {
      lines.push(watchLine(w, ar));
      doneWatches.push(w.id);
    }
    for (const a of answers.filter((x) => x.pi_uid === l.pi_uid)) {
      lines.push(`💬 ${esc(a.shop)} ${ar ? "رد على سؤالك" : "answered"}: “${esc(a.question.slice(0, 80))}”\n→ ${esc(a.answer.slice(0, 300))}`);
      doneAnswers.push(a.id);
    }
    const remind = ending.find((e) => e.pi_uid === l.pi_uid && (!l.last_digest || l.last_digest < new Date(new Date(e.ends_at).getTime() - 3 * 864e5).toISOString()));
    if (remind) lines.push(`⏳ ${ar ? `باقتك (${remind.plan}) هتخلص يوم ${remind.ends_at.slice(0, 10)} — البحث والطلبات اللي متستخدمتش هتنتهي معاها.` : `Your ${remind.plan} plan ends on ${remind.ends_at.slice(0, 10)} — unused searches and orders expire with it.`}`);
    if (!lines.length || !l.chat_id) continue;
    try {
      await send(l.chat_id, `<b>Dalil Pi</b> — ${ar ? "الجديد ليك" : "what's new for you"}\n\n${lines.join("\n\n")}\n\n${esc(app)}`);
      sent++;
      await upsertLink({ pi_uid: l.pi_uid, last_digest: new Date().toISOString() });
    } catch {
      /* blocked the bot, etc. — try again tomorrow */
    }
  }
  await Promise.all([markWatchesNotified(doneWatches), markAnswersNotified(doneAnswers)]);
  return { users: links.length, sent };
}
