import "server-only";

/**
 * Small in-memory TTL cache, per server instance. With Vercel Fluid compute an
 * instance serves many requests, so repeated searches (same words, same
 * country) skip the browser / web search entirely: faster answers, less Active
 * CPU and fewer paid API calls. Concurrent identical calls share one promise.
 */
interface Entry {
  at: number;
  ttl: number;
  value: Promise<unknown>;
}
const stores = ((globalThis as unknown as { __dalilCache?: Map<string, Map<string, Entry>> }).__dalilCache ??= new Map());
const MAX = 300;

export function cached<T>(ns: string, key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  let m = stores.get(ns);
  if (!m) stores.set(ns, (m = new Map()));
  const now = Date.now();
  const hit = m.get(key);
  if (hit && now - hit.at < hit.ttl) {
    m.delete(key); // refresh LRU position
    m.set(key, hit);
    return hit.value as Promise<T>;
  }
  const value = fn();
  m.set(key, { at: now, ttl: ttlMs, value });
  value.catch(() => m!.get(key)?.value === value && m!.delete(key)); // never cache failures
  while (m.size > MAX) m.delete(m.keys().next().value!);
  return value;
}

/** Normalizes a search phrase for cache keys ("  Sماعة  JBL" → "sماعة jbl"). */
export const norm = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

/** Drop a whole namespace on this instance (e.g. trust signals right after a new review). */
export function forget(ns: string): void {
  stores.delete(ns);
}
