# Salla Shop partner catalog API

Read-only access to the Salla Shop Mall catalog for approved partners.
Buyers still open the product link and order and pay on mall.salla-shop.com.

## What Salla sends you

- `BASE_URL`: `https://<project-ref>.supabase.co/functions/v1/partner-catalog`
- `PARTNER_ID`: for example `dalil`
- `SECRET`: a long random string. Keep it on your server only. Never put it in an app, a web page or a repo.

## Signing every request

Every request needs four headers:

| Header | Value |
|---|---|
| `X-Partner-Id` | your partner id |
| `X-Timestamp` | Unix time in seconds (must be within 5 minutes of now) |
| `X-Nonce` | a new random hex string (16 to 64 chars) for every request. A reused nonce is refused. |
| `X-Signature` | hex HMAC-SHA256 of the canonical string, using `SECRET` |

Canonical string (lines joined with `\n`):

```
GET
/partner-catalog/catalog?page=1&limit=200      <- path and query exactly as sent
<X-Timestamp>
<X-Nonce>
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855   <- sha256 of the empty body
```

Node.js example:

```js
import crypto from "node:crypto";

const BASE_URL = process.env.SALLA_BASE_URL; // .../functions/v1/partner-catalog
const PARTNER_ID = process.env.SALLA_PARTNER_ID;
const SECRET = process.env.SALLA_SECRET;
const EMPTY_SHA256 = crypto.createHash("sha256").update("").digest("hex");

export async function sallaGet(pathAndQuery, etag) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const canonical = ["GET", `/partner-catalog${pathAndQuery}`, ts, nonce, EMPTY_SHA256].join("\n");
  const sig = crypto.createHmac("sha256", SECRET).update(canonical).digest("hex");
  const headers = { "X-Partner-Id": PARTNER_ID, "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig };
  if (etag) headers["If-None-Match"] = etag;
  return fetch(BASE_URL + pathAndQuery, { headers });
}
```

## Endpoints

| Endpoint | Returns |
|---|---|
| `GET /catalog?page=1&limit=200` | in-stock products, paged (limit 1 to 200): `{ products, page, limit, total, pages, version, updated_at }` |
| `GET /health` | `{ ok: true, partner }` |

There is no search endpoint. Download the catalog and search your own copy.

One product:

```json
{
  "id": "d17b7bcd-...", "title": "oraimo SpaceBuds 2", "title_ar": "...",
  "description": "...", "description_ar": "...",
  "url": "https://mall.salla-shop.com/product/d17b7bcd-...",
  "image": "https://...webp", "images": ["https://...webp"],
  "price": 770.6351, "list_price": 856.2612, "currency": "PI",
  "in_stock": true, "category": "Mobile accessories", "category_ar": "...",
  "tags": ["..."], "created_at": "..."
}
```

`price` is the Pi price shown on the product page, without shipping.

## Limits and good behaviour

- The catalog is refreshed on Salla's side about every 10 minutes. Pulling it once an hour is enough.
- Send the `ETag` you got back as `If-None-Match`. When nothing changed you get `304` with no body.
- All pages of one pull should have the same `version`. If it changes mid-pull, start again from page 1.
- At most 30 requests per minute per partner. Over that you get `429` with `Retry-After`.
- Repeated bad requests from one IP get that IP blocked for a minute.

## Errors

| Status | Meaning |
|---|---|
| 401 | missing or wrong signature, old timestamp, or reused nonce |
| 404 | unknown path |
| 405 | only GET is allowed |
| 429 | too many requests, wait `Retry-After` seconds |
| 503 | catalog temporarily unavailable, or partner access turned off |
