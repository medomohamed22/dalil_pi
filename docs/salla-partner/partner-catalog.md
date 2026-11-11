# Salla Shop partner catalog API

Read-only access to the Salla Shop Mall catalog (the Salla Shop store and the mall merchants)
and to the public directory of the Salla apps (restaurants, services, Salla Care, Salla Go,
store services and Telegram instant products) for approved partners.
Buyers still open the link and order and pay on mall.salla-shop.com.

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

For the services directory the second line is, for example, `/partner-catalog/services?type=service&page=1&limit=200`.

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
| `GET /catalog?page=1&limit=200` | in-stock products of the Salla Shop store and of the mall merchants, paged (limit 1 to 200): `{ products, page, limit, total, pages, version, updated_at }` |
| `GET /services?type=restaurant&page=1&limit=200` | the apps directory, paged the same way: `{ services, page, limit, total, pages, version, updated_at }`. `type` is optional: `restaurant`, `service`, `health`, `delivery`, `mall_service` or `telegram`. Any other value answers `400 bad_type`. |
| `GET /health` | `{ ok: true, partner }` |
| `GET /status` (no signature) | setup self test for Salla: build, whether `PARTNER_KEYS` is read, ignored entries and why, secret length and first 8 characters of its SHA-256. Add `?db=1` to also try reading the catalog and the services directory. Never shows a secret. |

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
  "tags": ["..."], "created_at": "...",
  "source": "salla", "seller": null,
  "ships_to": ["EG"],
  "shipping_by_country": { "EG": 0.8123 }
}
```

`price` is the Pi price shown on the product page, without shipping.

`source` is `salla` for a product of the Salla Shop store and `merchant` for a mall merchant's
product. `seller` is the merchant's shop name (`null` for the Salla Shop store). Merchant product
links open `https://mall.salla-shop.com/merchant-product/<id>`.

`ships_to` is the list of countries (ISO codes) where this product can be ordered. A buyer in
another country is refused at checkout, so only show the product, or the order button, to buyers
in these countries.

`shipping_by_country` gives the shipping in Pi for each country in `ships_to`:

- `0` means free shipping.
- `null` means the shipping is worked out at checkout. Show "shipping at checkout".
- Shipping comes from the seller: the Salla Shop store has its own rates and every merchant has
  its own light and heavy rates. A rate is per shipping type (light, heavy, free), not per
  country, so the value is the same for every country in the list. A different price per
  country is not available today.
- `ships_to` of a merchant product is the list of countries that merchant sells to.
- Shipping is charged once per shipping type per seller in one order. Two products of the same
  type from the same seller pay it once. So `price + shipping` is exact for one product alone.

`url` already ends with `?ref=dalilpi`. Keep it as it is and do not add another `ref`.
It never changes the price.

## Services directory

`GET /services` lists what a visitor can already open in the Salla apps:

| `type` | What it is | `url` opens |
|---|---|---|
| `restaurant` | an active restaurant with at least one dish | the restaurant menu |
| `service` | one service listing of an active provider (Salla Services app) | the service page |
| `health` | a verified Salla Care clinic, lab, pharmacy or other provider | the provider page |
| `delivery` | a city where Salla Go has an active courier | Salla Go |
| `mall_service` | a service product sold by the Salla Shop store (the buyer chooses the amount) | the service product page |
| `telegram` | a Telegram instant product (Stars, Premium) | the Telegram product page |

Request:

```js
const res = await sallaGet("/services?type=restaurant&page=1&limit=200", savedEtag);
if (res.status === 304) { /* nothing changed */ }
const { services, pages, version } = await res.json();
```

One entry:

```json
{
  "id": "cb5eac39-...", "type": "restaurant",
  "name": "Kebab House", "name_ar": "...",
  "image": "https://...",
  "countries": ["EG"], "city": "Cairo",
  "category": "grills", "specialty": null, "provider": null,
  "price": null, "price_unit": null, "currency": "PI",
  "rating": 4.6, "ratings": 31,
  "url": "https://mall.salla-shop.com/restaurants/r/cb5eac39-...?ref=dalilpi"
}
```

- `id` is unique within its `type`. Use `type` + `id` as your key.
- `name` is English when the owner wrote it, otherwise the Arabic name. `name_ar` is the Arabic name.
- `countries` is where it works. An empty list means every country (`telegram`, and a `service`
  that did not limit its countries).
- `city` is the city or region the owner chose. It can be `null`.
- `category`: the cuisine (restaurant), the service category, the Salla Care kind (`clinic`,
  `lab`, `pharmacy` ...) or `delivery`. `specialty` is only for Salla Care. `provider` is the
  business name of a service provider (`Salla Shop` for `mall_service` and `telegram`).
- `price` is a Pi price only when there is one clear price, otherwise `null` and the app shows
  the price:
  - `service`: only when the provider set a fixed price in Pi.
  - `health`: the booking price the app shows (`price_unit` = `visit`). Pharmacies are `null`.
  - `telegram`: the smallest package. `price_unit` = `50_stars` for Stars, `3_months` for Premium.
  - `restaurant`, `delivery`, `mall_service`: always `null` (it depends on the order, the
    distance or the amount the buyer chooses).
- Prices that come from a local currency follow the Pi rate, so they can move a little between
  pulls. The app always charges its own current price.
- `image` can be `null`.
- Ordering, booking and payment always happen inside the Salla app after opening `url`.

What is never sent: phone numbers, street addresses, map locations, balances, commission or
anything about buyers. The only id of a person is the Salla Care page id, which is the id the
public provider link already shows. Hidden, paused, suspended or expired entries and apps that
Salla has switched off are left out.

## Limits and good behaviour

- The catalog and the services directory are refreshed on Salla's side about every 10 minutes. Pulling them once an hour is enough.
- Send the `ETag` you got back as `If-None-Match`. When nothing changed you get `304` with no body.
- All pages of one pull should have the same `version`. If it changes mid-pull, start again from page 1.
- At most 30 requests per minute per partner. Over that you get `429` with `Retry-After`.
- Repeated bad requests from one IP get that IP blocked for a minute.

## Errors

| Status | Meaning |
|---|---|
| 400 | unknown `type` on `/services` |
| 401 | missing or wrong signature, old timestamp, or reused nonce |
| 404 | unknown path |
| 405 | only GET is allowed |
| 429 | too many requests, wait `Retry-After` seconds |
| 503 | catalog temporarily unavailable, or partner access turned off |

## Orders that came from a partner

The `?ref=dalilpi` of the link a buyer opened is kept in their browser for 30 days. When that
buyer finishes an order (mall checkout, merchants, the services app or a restaurant), the new
orders get `dalilpi` as a label. One visit labels one checkout. Salla counts them per month and
compares with your monthly report. Salla Care bookings and Salla Go trips are not labelled yet.
The label never changes a price.

## Commission

Not part of this API. If Salla and Dalil Pi agree on a commission for orders you send, it is
agreed separately and calculated by Salla from the labelled orders.
