import "server-only";
import { createHash } from "node:crypto";
import { channel3Enabled } from "./channel3";
import { fetchWithTimeout } from "./net";
import { kv } from "./store";
import type { Market, PriceInsight } from "../types";

/**
 * "Buy now or wait?" — a deterministic verdict from:
 *  1. price history: Channel3 (US catalog) and every price Dalil itself has seen for that URL,
 *  2. the sales calendar of the market (Black Friday, White Friday, 11.11, Ramadan…).
 * No LLM involved, so the advice is explainable and reproducible.
 */

type Point = { t: number; p: number };
const DAY = 86_400_000;
const keyOf = (url: string) => `ph:${createHash("sha256").update(url).digest("hex").slice(0, 32)}`;

/** Remember prices we've seen (one point per URL per ~6h), so history grows with use. */
export async function recordPrices(offers: Array<{ url?: string; price: number; currency: string }>): Promise<void> {
  const now = Date.now();
  await Promise.all(
    offers
      .filter((o) => o.url && o.price > 0)
      .slice(0, 8)
      .map(async (o) => {
        const k = keyOf(o.url!);
        const pts = (await kv.get<Point[]>(k)) ?? [];
        const last = pts[pts.length - 1];
        if (last && now - last.t < 6 * 3600_000 && last.p === o.price) return;
        pts.push({ t: now, p: o.price });
        await kv.set(k, pts.slice(-120));
      }),
  ).catch(() => {});
}

async function channel3History(productId: string, signal?: AbortSignal): Promise<Point[]> {
  const base = (!process.env.VERCEL && process.env.CHANNEL3_API_BASE) || "https://api.trychannel3.com/v1";
  const res = await fetchWithTimeout(`${base.replace(/\/v1$/, "")}/v0/price-tracking/history/${encodeURIComponent(productId)}?days=90`, {
    headers: { "x-api-key": process.env.CHANNEL3_API_KEY ?? "" },
    timeoutMs: 6000,
    signal,
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { history?: Array<{ timestamp: string; price: number }> };
  return (j.history ?? []).map((h) => ({ t: Date.parse(h.timestamp), p: h.price })).filter((x) => x.t && x.p > 0);
}

/** Major sale events (approximate dates), per market. */
const EVENTS: Array<{ id: string; en: string; ar: string; date: string; markets: Market[]; drop: number }> = [
  { id: "1111", en: "11.11 Singles' Day", ar: "عروض 11.11", date: "2026-11-11", markets: ["EG", "US"], drop: 10 },
  { id: "whitefriday", en: "White Friday", ar: "الجمعة البيضاء", date: "2026-11-20", markets: ["EG"], drop: 15 },
  { id: "blackfriday", en: "Black Friday", ar: "بلاك فرايداي", date: "2026-11-27", markets: ["US", "EG"], drop: 15 },
  { id: "cybermonday", en: "Cyber Monday", ar: "سايبر مانداي", date: "2026-11-30", markets: ["US"], drop: 12 },
  { id: "1212", en: "12.12 Sale", ar: "عروض 12.12", date: "2026-12-12", markets: ["EG"], drop: 8 },
  { id: "newyear", en: "New Year sales", ar: "عروض رأس السنة", date: "2027-01-01", markets: ["EG", "US"], drop: 8 },
  { id: "ramadan", en: "Ramadan offers", ar: "عروض رمضان", date: "2027-02-08", markets: ["EG"], drop: 10 },
  { id: "presidents", en: "Presidents' Day sales", ar: "عروض Presidents' Day", date: "2027-02-15", markets: ["US"], drop: 8 },
  { id: "primeday", en: "Prime Day", ar: "برايم داي", date: "2027-07-13", markets: ["US", "EG"], drop: 15 },
];

function nextEvent(market: Market, now: number) {
  return EVENTS.filter((e) => e.markets.includes(market))
    .map((e) => ({ ...e, at: Date.parse(e.date + "T00:00:00Z") }))
    .filter((e) => e.at + DAY > now)
    .sort((a, b) => a.at - b.at)[0];
}

/** Deterministic sample history for demo-mode products (clearly labeled as sample data in the UI). */
function demoHistory(price: number, seed: string): Point[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const now = Date.now();
  const pts: Point[] = [];
  let p = price * 1.08;
  for (let i = 60; i >= 1; i -= 2) {
    p = p * (1 + (rnd() - 0.55) * 0.025);
    if (i === 34) p = price * 0.9; // a past flash sale
    if (i === 32) p = price * 1.04;
    pts.push({ t: now - i * DAY, p: Math.round(p * 100) / 100 });
  }
  pts.push({ t: now, p: price });
  return pts;
}

export async function priceInsight(input: {
  title: string;
  url?: string;
  price: number;
  currency: string;
  market: Market;
  productId?: string;
  demo?: boolean;
  signal?: AbortSignal;
}): Promise<PriceInsight> {
  const now = Date.now();
  let history: Point[] = [];
  let source: PriceInsight["source"] = "none";
  if (input.demo) {
    history = demoHistory(input.price, input.title);
    source = "sample";
  } else {
    if (input.productId && channel3Enabled()) {
      history = await channel3History(input.productId, input.signal).catch(() => []);
      if (history.length) source = "channel3";
    }
    if (input.url) {
      const own = (await kv.get<Point[]>(keyOf(input.url))) ?? [];
      if (own.length) {
        history = [...history, ...own].sort((a, b) => a.t - b.t);
        if (source === "none") source = "dalil";
      }
    }
    const last = history[history.length - 1];
    if (!last || last.p !== input.price) history.push({ t: now, p: input.price });
  }

  const ps = history.map((x) => x.p);
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  const enough = history.length >= 5 && now - history[0].t > 7 * DAY;
  const ev = nextEvent(input.market, now);
  const daysToEvent = ev ? Math.max(0, Math.round((ev.at - now) / DAY)) : undefined;
  const eventSoon = ev && daysToEvent! <= 30;

  let verdict: PriceInsight["verdict"] = "buy";
  let reason: PriceInsight["reason"] = "fair_price";
  let targetPrice: number | undefined;
  const round = (v: number) => (input.currency === "EGP" ? Math.round(v / 10) * 10 : Math.round(v * 100) / 100);

  if (enough && max > min && input.price <= min + (max - min) * 0.12) {
    verdict = "buy";
    reason = "near_lowest";
  } else if (eventSoon) {
    verdict = "wait";
    reason = "sale_soon";
    targetPrice = round(input.price * (1 - ev!.drop / 100));
  } else if (enough && input.price > mean * 1.06) {
    verdict = "wait";
    reason = "above_average";
    targetPrice = round(Math.min(mean, input.price * 0.95));
  } else if (!enough) {
    reason = "no_history";
  }

  // Keep the chart light: at most ~40 points.
  const step = Math.max(1, Math.ceil(history.length / 40));
  const chart = history.filter((_, i) => i % step === 0 || i === history.length - 1);
  return {
    verdict,
    reason,
    confidence: enough ? (history.length >= 20 ? "high" : "medium") : "low",
    price: input.price,
    currency: input.currency,
    targetPrice,
    stats: { min, max, mean: Math.round(mean * 100) / 100, points: history.length, days: Math.round((now - history[0].t) / DAY) },
    history: chart,
    event: ev ? { id: ev.id, en: ev.en, ar: ev.ar, date: ev.date, daysAway: daysToEvent!, drop: ev.drop } : undefined,
    source,
  };
}
