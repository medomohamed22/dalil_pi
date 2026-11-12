import "server-only";
import { createHash } from "node:crypto";
import type { MetaConfig } from "./meta";

/**
 * Hosted AI: the agent always runs on the server's Meta key. The key lives only in the server env
 * (META_API_KEY), always targets the official Meta endpoint (never a
 * user-supplied base URL), and is rate-limited per visitor and globally.
 */
const META_BASE = (!process.env.VERCEL && process.env.DALIL_TEST_MODEL_BASE) /* tests only */ || "https://api.meta.ai/v1";

/**
 * The model the app runs on: Muse Ember 1.0 (Meta's small, fast model — tools and photos supported).
 * META_MODEL (optional, plain value) switches it without a code change, e.g. back to
 * "muse-spark-1.3-contributor". Only Meta model ids are accepted.
 */
export const HOSTED_MODEL = /^muse-[a-z0-9.-]{1,40}$/.test(process.env.META_MODEL ?? "") ? process.env.META_MODEL! : "muse-ember-1.0";

export function hostedEnabled(): boolean {
  return !!process.env.META_API_KEY;
}

export function hostedLimits() {
  return {
    perVisitor: Number(process.env.HOSTED_DAILY_LIMIT) || 40,
    global: Number(process.env.GLOBAL_DAILY_AI_LIMIT ?? process.env.HOSTED_GLOBAL_DAILY_LIMIT) || 500,
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
