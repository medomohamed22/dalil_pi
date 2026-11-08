// Salla Shop × Dalil Pi — read-only partner API (Supabase Edge Function, Deno).
//
// Deploy (no database changes, nothing else in Salla is touched):
//   supabase functions new dalil-partner          # then replace index.ts with this file
//   supabase secrets set DALIL_PARTNER_KEY=<long random key you share only with Dalil Pi>
//   supabase functions deploy dalil-partner --no-verify-jwt
//
// URL: https://<project-ref>.supabase.co/functions/v1/dalil-partner
//
// Endpoints (all need "Authorization: Bearer <DALIL_PARTNER_KEY>"):
//   GET /dalil-partner/catalog?page=1&limit=200                     → whole in-stock catalog, paged
//   GET /dalil-partner/products?q=headphones&limit=12               → keyword search
//   GET /dalil-partner/health                                       → { ok: true }
//
// It only READS: products (+ categories), store_settings. It returns only what the public
// product pages already show (name, description, Pi price, image, stock, link). Prices in Pi
// use the same formula as the website: EGP ÷ usd_rate ÷ pi_price_cache × (1 + profit_percentage/100).
//
// Column names below match what mall.salla-shop.com/products loads today. If a name differs in
// your schema, change it in SELECT / toProduct() only.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://mall.salla-shop.com";
const KEY = Deno.env.get("DALIL_PARTNER_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Only columns the public /products page already reads. If you have more product photos in another
// column (e.g. "images"), add it here and it is returned automatically.
const SELECT =
  "id,name,name_ar,description,description_ar,local_price_egp,original_price,image,category,in_stock,stock_quantity,tags,created_at,categories(name,name_ar)";

type Row = Record<string, unknown>;
type Rates = { usd_rate: number; pi_price_cache: number; profit_percentage: number };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=60" },
  });

/** Same equality check cost whatever the input (no timing leaks on the key). */
function sameKey(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

let ratesCache: { at: number; rates: Rates } | null = null;
async function rates(): Promise<Rates> {
  if (ratesCache && Date.now() - ratesCache.at < 60_000) return ratesCache.rates;
  const { data, error } = await db.from("store_settings").select("usd_rate,pi_price_cache,profit_percentage").limit(1).single();
  if (error || !data) throw new Error("store_settings unavailable");
  ratesCache = { at: Date.now(), rates: data as Rates };
  return ratesCache.rates;
}

const toPi = (egp: number, r: Rates) =>
  egp > 0 && r.usd_rate > 0 && r.pi_price_cache > 0
    ? Math.round((egp / r.usd_rate / r.pi_price_cache) * (1 + (r.profit_percentage ?? 0) / 100) * 1e4) / 1e4
    : null;

function toProduct(p: Row, r: Rates) {
  const egp = Number(p.local_price_egp);
  const was = Number(p.original_price);
  const cat = (p.categories ?? {}) as Row;
  const images = [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter((x) => typeof x === "string" && x.startsWith("https://"));
  return {
    id: p.id,
    title: p.name,
    title_ar: p.name_ar ?? null,
    description: p.description ?? null,
    description_ar: p.description_ar ?? null,
    url: `${SITE}/product/${p.id}`,
    image: images[0] ?? null,
    images: [...new Set(images)].slice(0, 8),
    price: toPi(egp, r), // Pi, as shown on the product page
    currency: "PI",
    list_price: was > egp ? toPi(was, r) : null, // "was" price in Pi, when on sale
    price_egp: egp || null,
    list_price_egp: was > egp ? was : null,
    in_stock: p.in_stock !== false && (p.stock_quantity == null || Number(p.stock_quantity) > 0),
    stock: p.stock_quantity ?? null,
    category: cat.name ?? p.category ?? null,
    category_ar: cat.name_ar ?? null,
    tags: Array.isArray(p.tags) ? p.tags : [],
    store: { name: "Salla Shop Mall", verified: true },
    created_at: p.created_at ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "GET only" }, 405);
  const auth = req.headers.get("authorization") ?? "";
  if (!KEY || !sameKey(auth, `Bearer ${KEY}`)) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/dalil-partner/, "") || "/";
  try {
    if (path === "/health") return json({ ok: true });
    const r = await rates();

    if (path === "/catalog") {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const q = db.from("products").select(SELECT, { count: "exact" }).eq("in_stock", true).order("id").range((page - 1) * limit, page * limit - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      const products = (data ?? []).map((p) => toProduct(p as Row, r)).filter((p) => p.price);
      return json({ products, page, limit, total: count ?? null, pages: count != null ? Math.ceil(count / limit) : null, rates: r });
    }

    if (path === "/products") {
      const term = (url.searchParams.get("q") ?? "").trim().slice(0, 80).replace(/[%,()"\\*]/g, " ").replace(/\s+/g, " ");
      const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit")) || 12));
      if (!term) return json({ products: [] });
      const like = `"%${term}%"`; // quoted: spaces / Arabic are safe inside the filter
      const { data, error } = await db
        .from("products")
        .select(SELECT)
        .eq("in_stock", true)
        .or(`name.ilike.${like},name_ar.ilike.${like},description.ilike.${like},description_ar.ilike.${like}`)
        .limit(limit);
      if (error) throw error;
      return json({ products: (data ?? []).map((p) => toProduct(p as Row, r)).filter((p) => p.price) });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message ?? "error" }, 500);
  }
});
