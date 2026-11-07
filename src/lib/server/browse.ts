import "server-only";
import * as cheerio from "cheerio";
import { assertPublicUrl, fetchWithTimeout, readLimited } from "./net";
import type { LinkPreview } from "../types";

export interface ProductFacts {
  name?: string;
  price?: number;
  currency?: string;
  listPrice?: number;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  brand?: string;
  image?: string;
  sku?: string;
}

export interface BrowseResult {
  url: string;
  status: number;
  preview: LinkPreview;
  product: ProductFacts;
  /** Visible page text. UNTRUSTED: may contain prompt-injection attempts. */
  text: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function num(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}

function first<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type Json = Record<string, unknown>;

function findProduct(node: unknown): Json | undefined {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProduct(n);
      if (f) return f;
    }
    return;
  }
  const obj = node as Json;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((x) => typeof x === "string" && /Product/i.test(x))) return obj;
  if (obj["@graph"]) return findProduct(obj["@graph"]);
  return;
}

function absolutize(src: string | undefined, base: string): string | undefined {
  if (!src) return;
  try {
    return new URL(src, base).toString();
  } catch {
    return;
  }
}

export function extract(html: string, url: string): Omit<BrowseResult, "status"> {
  const $ = cheerio.load(html);
  const meta = (sel: string) => $(sel).attr("content")?.trim() || undefined;

  const product: ProductFacts = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    if (product.name) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const p = findProduct(data);
      if (!p) return;
      product.name = p.name as string;
      product.brand =
        typeof p.brand === "string" ? p.brand : ((p.brand as Json)?.name as string);
      product.image = typeof first(p.image as string[]) === "string"
        ? (first(p.image as string[]) as string)
        : ((first(p.image as Json[]) as Json)?.url as string);
      product.sku = p.sku as string;
      const offers = first(p.offers as Json | Json[]) as Json | undefined;
      if (offers) {
        product.price = num(offers.price ?? offers.lowPrice);
        product.currency = offers.priceCurrency as string;
        product.availability = String(offers.availability ?? "").split("/").pop();
      }
      const ar = p.aggregateRating as Json | undefined;
      if (ar) {
        product.rating = num(ar.ratingValue);
        product.reviewCount = num(ar.reviewCount ?? ar.ratingCount);
      }
    } catch {
      /* malformed JSON-LD */
    }
  });

  product.price ??= num(meta('meta[property="product:price:amount"]') ?? meta('meta[property="og:price:amount"]') ?? $('[itemprop="price"]').attr("content"));
  product.currency ??= meta('meta[property="product:price:currency"]') ?? meta('meta[property="og:price:currency"]') ?? $('[itemprop="priceCurrency"]').attr("content");

  const host = new URL(url).hostname.replace(/^www\./, "");
  const preview: LinkPreview = {
    url,
    title: meta('meta[property="og:title"]') ?? product.name ?? ($("title").first().text().trim() || undefined),
    description: meta('meta[property="og:description"]') ?? meta('meta[name="description"]'),
    image: absolutize(meta('meta[property="og:image"]') ?? product.image, url),
    site: meta('meta[property="og:site_name"]') ?? host,
    price: product.price,
    currency: product.currency,
  };
  if (product.image) product.image = absolutize(product.image, url);

  $("script, style, noscript, svg, iframe, nav, footer, header, form").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000);

  return { url, preview, product, text };
}

export async function browse(rawUrl: string, signal?: AbortSignal): Promise<BrowseResult> {
  let target = (await assertPublicUrl(rawUrl)).toString();
  let res: Response | undefined;
  // Follow redirects manually so every hop passes the SSRF guard.
  for (let hop = 0; hop < 5; hop++) {
    res = await fetchWithTimeout(target, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
      redirect: "manual",
      timeoutMs: 8000,
      signal,
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      target = (await assertPublicUrl(new URL(loc, target).toString())).toString();
      continue;
    }
    break;
  }
  if (!res) throw new Error("No response");
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("html")) {
    return {
      url: target,
      status: res.status,
      preview: { url: target, site: new URL(target).hostname },
      product: {},
      text: "",
    };
  }
  const html = await readLimited(res, 1_500_000);
  return { status: res.status, ...extract(html, target) };
}
