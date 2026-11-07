import "server-only";
import { createHash } from "node:crypto";
import type { MetaConfig } from "./meta";
import { kv } from "./store";

/**
 * Hosted AI: lets visitors (e.g. hackathon judges) try the real agent without
 * bringing their own Meta API key. The key lives only in the server env
 * (META_API_KEY), always targets the official Meta endpoint (never a
 * user-supplied base URL), and is rate-limited per visitor and globally.
 */
const META_BASE = (!process.env.VERCEL && process.env.DALIL_TEST_MODEL_BASE) /* tests only */ || "https://api.meta.ai/v1";

/** The one model the app runs on (fixed for cost and predictable behaviour). */
export const HOSTED_MODEL = "muse-spark-1.3-contributor";

export function hostedEnabled(): boolean {
  return !!process.env.META_API_KEY;
}

export function hostedLimits() {
  return {
    perVisitor: Number(process.env.HOSTED_DAILY_LIMIT) || 40,
    global: Number(process.env.HOSTED_GLOBAL_DAILY_LIMIT) || 500,
  };
}

export function hostedConfig(reasoningEffort?: string): MetaConfig {
  return {
    baseUrl: META_BASE,
    apiKey: process.env.META_API_KEY ?? "",
    model: HOSTED_MODEL,
    reasoningEffort,
  };
}

export function visitorId(req: Request): string {
  const h = req.headers;
  const ip =
    h.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for") ?? "").split(",").pop()?.trim() ||
    "unknown";
  return createHash("sha256").update(`dalil:${ip}`).digest("hex").slice(0, 24);
}

/** Counts one hosted request; throws HOSTED_LIMIT when a daily cap is hit. */
export async function takeHostedQuota(req: Request): Promise<{ used: number; limit: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const { perVisitor, global } = hostedLimits();
  const all = await kv.incr(`hosted:all:${day}`, 26 * 3600);
  if (all > global) throw new Error("HOSTED_LIMIT");
  const used = await kv.incr(`hosted:v:${visitorId(req)}:${day}`, 26 * 3600);
  if (used > perVisitor) throw new Error("HOSTED_LIMIT");
  return { used, limit: perVisitor };
}
