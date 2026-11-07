import "server-only";
import { fetchWithTimeout } from "./net";
import type { RawOffer } from "./rank";

/**
 * Channel3 — one API for clean, structured product data (US catalog).
 * Used as the agent's fast first source in the US market: prices, images and
 * ratings in ~1s, without scraping pages that block bots.
 * Docs: https://docs.trychannel3.com  ·  Auth: x-api-key header.
 */
const API = (!process.env.VERCEL && process.env.CHANNEL3_API_BASE) /* tests only */ || "https://api.trychannel3.com/v1";

export function channel3Enabled(): boolean {
  return !!process.env.CHANNEL3_API_KEY;
}

interface C3Price {
  price: number;
  compare_at_price?: number | null;
  currency: string;
}
interface C3Offer {
  url: string;
  domain: string;
  price: C3Price;
  availability: string;
  condition?: string | null;
}
interface C3Product {
  id: string;
  title: string;
  brands?: Array<{ name: string }>;
  images?: Array<{ url: string; cleaned_url?: string | null; is_main_image?: boolean }>;
  offers?: C3Offer[];
  ratings?: { value: number; count: number } | null;
  key_features?: string[] | null;
}

async function call<T>(path: string, body: unknown, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  const res = await fetchWithTimeout(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.CHANNEL3_API_KEY ?? "" },
    body: JSON.stringify(body),
    timeoutMs,
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = t.slice(0, 200);
    try {
      const d = JSON.parse(t)?.detail;
      msg = typeof d === "string" ? d : JSON.stringify(d).slice(0, 200);
    } catch {
      /* not json */
    }
    throw new Error(`Channel3 ${res.status}: ${msg}`);
  }
  return (await res.json()) as T;
}

function mainImage(p: C3Product): string | undefined {
  const imgs = p.images ?? [];
  const m = imgs.find((i) => i.is_main_image) ?? imgs[0];
  return m?.url || m?.cleaned_url || undefined;
}

export interface CatalogItem extends RawOffer {
  productId: string;
  brand?: string;
  features?: string[];
}

/** Flatten products into one entry per merchant offer (cheapest first per product). */
function flatten(products: C3Product[], perProduct = 3): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const p of products) {
    const offers = (p.offers ?? [])
      .filter((o) => o.availability !== "OutOfStock" && o.price?.price > 0)
      .sort((a, b) => a.price.price - b.price.price)
      .slice(0, perProduct);
    for (const o of offers) {
      out.push({
        productId: p.id,
        title: p.title,
        brand: p.brands?.[0]?.name,
        store: o.domain.replace(/^www\./, ""),
        url: o.url,
        image: mainImage(p),
        price: o.price.price,
        currency: o.price.currency || "USD",
        listPrice: o.price.compare_at_price && o.price.compare_at_price > o.price.price ? o.price.compare_at_price : undefined,
        rating: p.ratings?.value ? Math.round(p.ratings.value * 10) / 10 : undefined,
        reviewCount: p.ratings?.count || undefined,
        features: p.key_features?.slice(0, 3) ?? undefined,
      });
    }
  }
  return out;
}

export async function catalogSearch(
  opts: { query?: string; base64Image?: string; maxPrice?: number; limit?: number },
  signal?: AbortSignal,
): Promise<CatalogItem[]> {
  const body: Record<string, unknown> = {
    limit: Math.min(Math.max(opts.limit ?? 8, 1), 15),
    config: { country: "US", currency: "USD" },
  };
  if (opts.query) body.query = opts.query;
  if (opts.base64Image) body.base64_image = opts.base64Image;
  if (opts.maxPrice && opts.maxPrice > 0) {
    body.filters = { conditions: ["new"], availability: ["InStock"], price: { max_price: opts.maxPrice } };
  }
  const r = await call<{ products: C3Product[] }>("/search", body, signal);
  return flatten(r.products ?? []);
}

/** Current price of a product URL (used by price watches in the US market). */
export async function lookupPrice(url: string, signal?: AbortSignal): Promise<{ price: number; currency: string } | null> {
  const r = await call<{ product: C3Product }>("/lookup", { url, max_staleness_hours: 1 }, signal, 25000);
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const offers = r.product?.offers ?? [];
  const o = offers.find((x) => x.url === url) ?? offers.find((x) => x.domain.replace(/^www\./, "") === host);
  return o?.price?.price ? { price: o.price.price, currency: o.price.currency || "USD" } : null;
}
