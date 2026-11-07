import "server-only";
import { fetchWithTimeout } from "./net";

/**
 * Live Pi price from OKX (public market ticker, no key needed):
 *   GET https://www.okx.com/api/v5/market/ticker?instId=PI-USDT
 * Cached for 60 s per server instance. A price older than 15 minutes is
 * treated as unavailable (callers must then not quote prices in USD).
 */
const OKX_TICKER = "https://www.okx.com/api/v5/market/ticker?instId=PI-USDT";
const CACHE_MS = 60_000;
const STALE_MS = 15 * 60_000;

export interface PiPrice {
  usd: number;
  high24h?: number;
  low24h?: number;
  at: number;
  source: "okx";
}

const g = globalThis as unknown as { __piPrice?: PiPrice };

export async function piUsdPrice(): Promise<PiPrice | null> {
  const cached = g.__piPrice;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  try {
    const res = await fetchWithTimeout(OKX_TICKER, { timeoutMs: 6000, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`OKX ${res.status}`);
    const j = (await res.json()) as { code?: string; data?: Array<{ last?: string; high24h?: string; low24h?: string; ts?: string }> };
    const d = j.data?.[0];
    const usd = Number(d?.last);
    if (j.code !== "0" || !(usd > 0)) throw new Error("bad OKX ticker");
    g.__piPrice = { usd, high24h: Number(d?.high24h) || undefined, low24h: Number(d?.low24h) || undefined, at: Date.now(), source: "okx" };
    return g.__piPrice;
  } catch {
    return cached && Date.now() - cached.at < STALE_MS ? cached : null;
  }
}
