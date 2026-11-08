"use client";

/** The store a card belongs to ("Pi Chain Mall · seller" → "Pi Chain Mall"). */
export const storeOf = (s: string) => s.split(" · ")[0].trim();

/**
 * Tell our server Dalil Pi sent someone to a store (a visit or an order). Fire-and-forget:
 * keepalive lets it finish even though the store opens in a new tab right after.
 */
export function track(kind: "visit" | "order", o: { store: string; url?: string; title?: string }, token?: string | null): void {
  try {
    void fetch("/api/track", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ kind, store: storeOf(o.store).slice(0, 80), url: o.url && /^https?:\/\//.test(o.url) ? o.url.slice(0, 500) : undefined, title: o.title?.slice(0, 200) }),
    }).catch(() => {});
  } catch {
    /* tracking must never break a click */
  }
}
