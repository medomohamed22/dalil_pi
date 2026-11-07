import "server-only";

/**
 * Price grounding. The model proposes offers, but Dalil only signs a price
 * that was actually observed during this run — on a store/catalog page the
 * server fetched itself, in Meta's web-search results, or in an offer Dalil
 * already signed earlier in the conversation. Anything else is flagged
 * "price_unverified" and checkout refuses it, so neither a jailbroken model
 * nor a custom model endpoint can invent a $1 iPhone.
 */
const AR_DIGITS = /[٠-٩]/g;
const CUR = String.raw`(?:US\$|\$|USD|EGP|E£|LE|L\.E\.?|ج\.?\s?م|جنيه|جم)`;
const NUM = String.raw`(\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const AMOUNT_RE = new RegExp(`${CUR}\\s?${NUM}|${NUM}\\s?${CUR}|"(?:price|sale_?price|current_?price|amount|value)"\\s*:\\s*"?${NUM}`, "gi");
const MAX_AMOUNTS = 4000;

function normText(s: string): string {
  return s
    .replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٬/g, ",")
    .replace(/٫/g, ".");
}

export function normUrl(u: string): string | null {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "").toLowerCase()}${x.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return null;
  }
}

const close = (a: number, b: number, tol: number) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(0.01, b * tol);

export class PriceEvidence {
  private observed = new Map<string, number[]>();
  private amounts: number[] = [];

  /** A structured price for a URL (catalog item, parsed product page, signed offer). */
  addObserved(url: string | undefined, price: unknown) {
    const p = Number(price);
    if (!(p > 0) || !Number.isFinite(p)) return;
    this.pushAmount(p);
    const k = url && normUrl(url);
    if (!k) return;
    this.observed.set(k, [...(this.observed.get(k) ?? []), p].slice(-20));
  }

  /** Free text / JSON from a trusted tool result: every amount next to a currency counts. */
  addText(text: string | undefined) {
    if (!text) return;
    for (const m of normText(text).matchAll(AMOUNT_RE)) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (raw) this.pushAmount(Number(raw.replace(/[,\s]/g, "")));
    }
  }

  private pushAmount(n: number) {
    if (n > 0 && Number.isFinite(n) && this.amounts.length < MAX_AMOUNTS) this.amounts.push(n);
  }

  isGrounded(o: { url?: string; price: number }): boolean {
    const k = o.url && normUrl(o.url);
    if (k && (this.observed.get(k) ?? []).some((p) => close(p, o.price, 0.02))) return true;
    return this.amounts.some((a) => close(a, o.price, 0.01));
  }
}
