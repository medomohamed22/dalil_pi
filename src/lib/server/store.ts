import "server-only";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Expiring counters for rate limits and daily AI caps. Backed by Supabase
 * (`incr_counter` SQL function) when configured; otherwise an in-memory map
 * that is fine for local development but NOT shared between serverless
 * instances.
 */
export interface Counters {
  /** Atomic counter that expires ttlSec after its first increment. */
  incr(key: string, ttlSec: number): Promise<number>;
}

export const storePersistent = supabaseEnabled;

function supabaseCounters(): Counters {
  return {
    async incr(key, ttl) {
      const { data, error } = await supabase().rpc("incr_counter", { p_key: key, p_ttl_seconds: ttl });
      if (error) throw new Error(`counter: ${error.message}`);
      return Number(data);
    },
  };
}

function memoryCounters(): Counters {
  const g = globalThis as unknown as { __dalilCounters?: Map<string, { v: number; exp: number }> };
  const m = (g.__dalilCounters ??= new Map());
  return {
    async incr(key, ttl) {
      const now = Date.now();
      const cur = m.get(key);
      const next = !cur || cur.exp < now ? { v: 1, exp: now + ttl * 1000 } : { v: cur.v + 1, exp: cur.exp };
      m.set(key, next);
      return next.v;
    },
  };
}

export const counters: Counters = storePersistent ? supabaseCounters() : memoryCounters();
