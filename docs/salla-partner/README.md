# Salla Shop × Dalil Pi — partner API (ready to deploy)

**One file, one command, read-only.** No database changes, no change to any existing Salla code.

## What it is
A Supabase Edge Function ([`dalil-partner/index.ts`](dalil-partner/index.ts)) that runs inside
Salla Shop's own Supabase project and returns the Salla Shop Mall catalog as JSON to Dalil Pi only
(protected by a secret key). Dalil Pi then shows Salla products instantly, with exact Pi prices and
a link to the product page on mall.salla-shop.com. Buyers still order and pay on Salla.

- Reads only: `products` (+ `categories`) and `store_settings`. Writes nothing.
- Returns only what the public product pages already show (name, description, image, Pi price,
  stock, category, link).
- Pi price = the website's formula: `EGP ÷ usd_rate ÷ pi_price_cache × (1 + profit_percentage/100)`.
- Dalil Pi calls it about once an hour (whole catalog) plus a few searches. Responses can be cached
  for 60 s.

## Deploy (5 minutes)
```bash
supabase functions new dalil-partner                 # creates supabase/functions/dalil-partner/
# replace supabase/functions/dalil-partner/index.ts with the file in this folder
supabase secrets set DALIL_PARTNER_KEY="<a long random key>"
supabase functions deploy dalil-partner --no-verify-jwt
```
(`--no-verify-jwt` because the function checks its own key; it refuses every request without it.)

Then send Dalil Pi two values: the URL
`https://<project-ref>.supabase.co/functions/v1/dalil-partner` and the key.
To revoke access at any time: `supabase secrets set DALIL_PARTNER_KEY="<new key>"`.

## Endpoints
All need `Authorization: Bearer <DALIL_PARTNER_KEY>`; only `GET`.

| Endpoint | Returns |
|---|---|
| `GET /catalog?page=1&limit=200` | every in-stock product, paged: `{ products, page, limit, total, pages, rates }` |
| `GET /products?q=<keywords>&limit=12` | keyword search (Arabic or English) in names and descriptions |
| `GET /health` | `{ ok: true }` |

One product:
```json
{
  "id": "d17b7bcd-…", "title": "oraimo SpaceBuds 2 …", "title_ar": "سماعات لاسلكية …",
  "description": "…", "description_ar": "…",
  "url": "https://mall.salla-shop.com/product/d17b7bcd-…",
  "image": "https://…webp", "images": ["https://…webp"],
  "price": 770.6351, "currency": "PI", "list_price": 856.2612,
  "price_egp": 2700, "list_price_egp": 3000,
  "in_stock": true, "stock": 2, "category": "Mobile accessories", "category_ar": "اكسسوارات موبايل",
  "tags": ["سماعات"], "store": { "name": "Salla Shop Mall", "verified": true }, "created_at": "…"
}
```

## If your column names differ
Edit `SELECT` and `toProduct()` at the top of the file. Optional additions Dalil Pi will use
automatically: more photos (an `images` array column), merchant products, ratings
(`rating`, `review_count`).

## Tested
The function was run with Deno against a PostgREST mock of these tables: wrong/missing key → 401,
non-GET → 405, catalog paging, Arabic search, filter-injection attempts neutralised, and the Pi
price matches the website exactly (2,700 EGP → 770.6351 π).

---

# بالعربي

**ملف واحد، وأمر نشر واحد، وقراءة بس.** مفيش أي تعديل في قاعدة البيانات ولا في كود سلة الحالي.

- دالة Edge Function بتشتغل جوه مشروع Supabase بتاع سلة. بترجّع كتالوج سلة مول بصيغة JSON لدليل باي بس، ومحمية بمفتاح سري.
- بتقرا بس من جداول `products` و`categories` و`store_settings`، ومش بتكتب أي حاجة.
- بترجّع نفس البيانات اللي ظاهرة أصلاً في صفحة المنتج العامة.
- سعر الباي بنفس معادلة الموقع بالظبط.
- المشتري بيطلب ويدفع على سلة زي ما هو.

**النشر:** نفس الأوامر الأربعة اللي فوق. بعدها ابعتوا لدليل باي رابط الدالة والمفتاح.
ولو حبيتوا توقفوا الوصول في أي وقت: غيّروا المفتاح بأمر `supabase secrets set`.

لو أسماء الأعمدة عندكم مختلفة، عدّلوا `SELECT` و`toProduct()` في أول الملف بس.
