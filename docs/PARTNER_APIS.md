# Dalil Pi — Partner data APIs (Map of Pi · Salla Shop)

**Why:** with partner APIs Dalil Pi gets exact shop/product data in about 1 second instead of
opening store websites in a browser (10–75 s). Prices, links, images, stock and ratings come
straight from the source, so results are faster **and** more accurate.

The code is ready (`src/lib/server/partners.ts`). Each API stays **off** until its owner gives
access and you add the keys in **Vercel → Settings → Environment Variables**, then redeploy.
Check it worked at `https://<your-domain>/api/config` → `"partners": { "mapOfPi": true, "sallaApi": true }`.

| Partner | Vercel variables | What it powers |
|---|---|---|
| Map of Pi | `MAPOFPI_API_URL` (required), `MAPOFPI_API_KEY` (if they give one), `MAPOFPI_APP_URL` (optional, default `https://mapofpi7689.pinet.com`) | "Near me": real Pi shops around the user with address, pin, rating, trust meter and item prices in Pi |
| Salla Shop | `SALLA_API_URL`, `SALLA_API_KEY` (both required) | Product search on Salla Shop Mall without the headless browser |

Until then: local shops come from web search, and Salla search uses its public search page in a
headless browser (slower). Dalil Pi never opens Map of Pi / Pi apps in the browser any more —
they are interactive apps that can't be read and only wasted time.

---

## 1. Map of Pi

Dalil Pi uses the same endpoints as Map of Pi's own open-source app
([github.com/map-of-pi](https://github.com/map-of-pi)), read-only:

| Call | Used for |
|---|---|
| `POST {api}/sellers/fetch` body `{ "bounds": { "sw_lat", "sw_lng", "ne_lat", "ne_lng" }, "search_query"?: "coffee" }` | Sellers inside a ~10 km box around the user |
| `GET {api}/sellers/{seller_id}` | Address, rating, description |
| `GET {api}/sellers/item/{seller_id}` | Items, Pi prices, stock |

Sent with `Authorization: Bearer <MAPOFPI_API_KEY>` when a key is set. Test, inactive and
restricted sellers are skipped. Every card links back to the seller's page in the Map of Pi app
and says "Listed on Map of Pi". The user's location is used only for the query (rounded to ~1 km
when it comes from GPS; city-level when it comes from the IP) and is not stored.

**What to ask Map of Pi for:** permission to use these endpoints from Dalil Pi's server, the
production API base URL, an API key if they want one, and their rate limit.

---

## 2. Salla Shop — "Dalil Pi Partner API v1"

Salla Shop doesn't publish a public API, so this is the contract Dalil Pi is built for. If Salla
already has an API with a different shape, send their docs and an adapter is a small change.

```
GET {SALLA_API_URL}/products?q=<keywords>&country=<ISO2>&limit=<1-24>
Authorization: Bearer <SALLA_API_KEY>

200 OK
{
  "products": [
    {
      "id": "string",
      "title": "string",
      "url": "https://mall.salla-shop.com/product/<id>",   // exact product page
      "image": "https://…",                                 // product photo (not a logo)
      "price": 420.5,
      "currency": "PI",
      "in_stock": true,
      "rating": 4.6,          // 0–5, optional
      "review_count": 51,     // optional
      "ships_to": ["EG","SA"],// optional
      "store": { "id": "…", "name": "Tech Hub", "rating": 4.8, "verified": true }   // optional
    }
  ]
}
```

- Target speed: under 1 s. Dalil Pi times out after 5 s and falls back to the browser.
- Read-only; one search = at most 2 calls (English + Arabic keywords).
- Later (optional): `POST /orders` to place an order with the buyer's address and return Salla's
  Pi payment page — the same flow already working for WooCommerce stores with Sallanet Pay.

**What to ask Salla for:** an API key for product search (above, or their own API docs), the rate
limit, permission to show product data and images with links back to Salla, and a referral /
affiliate arrangement.

---

## 3. Messages to send

Fill in your name before sending. App link: https://pihackathontest.vercel.app

### Salla Shop — email to `support@salla-shop.com`

**Subject:** Partnership request: product search API for Dalil Pi (AI shopping agent for Pi)

> Hello Salla Shop team,
>
> I'm building **Dalil Pi**, an AI shopping assistant for Pi Network users
> (https://pihackathontest.vercel.app), for the Pi Next hackathon. Users describe what they need
> and Dalil Pi finds it in stores that accept Pi — Salla Shop Mall is the first marketplace we
> recommend for Egypt, the Middle East and Africa. Every result links straight to the product page
> on Salla, and the buyer pays Salla with Pi as usual; Dalil Pi never handles the payment.
>
> Today we can only read Salla's public search page, which is slow. We'd like to ask for:
> 1. An API key for **product search** (keywords + country → title, product link, image, Pi price,
>    stock, rating). Our proposed format is attached, but we're happy to use your existing API.
> 2. Your rate limit and any attribution rules.
> 3. If possible, a **referral/affiliate** arrangement for orders we send you.
> 4. Later: an API to create an order with the buyer's shipping address and return the Salla
>    payment page.
>
> This would make Salla products appear faster and with exact prices for every Dalil Pi user.
> Thank you!
>
> [Your name] — Dalil Pi

### Salla Shop — نفس الرسالة بالعربي

**الموضوع:** طلب شراكة: واجهة برمجية للبحث عن المنتجات لتطبيق دليل باي

> أهلاً فريق سلة شوب،
>
> أنا بطوّر **دليل باي**، مساعد تسوّق بالذكاء الاصطناعي لمستخدمي Pi Network
> (https://pihackathontest.vercel.app) لهاكاثون Pi Next. المستخدم بيكتب اللي محتاجه، ودليل باي
> بيدوّر عليه في المتاجر اللي بتقبل الباي، وسلة شوب مول هو أول سوق بنرشّحه في مصر والشرق الأوسط
> وأفريقيا. كل نتيجة بتفتح صفحة المنتج على سلة مباشرة، والمشتري بيدفع لسلة بالباي عادي، ودليل باي
> مش بيلمس الدفع خالص.
>
> حالياً بنقرا صفحة البحث العامة بتاعة سلة، وده بطيء. بنطلب:
> 1. مفتاح API **للبحث عن المنتجات** (كلمات البحث + البلد ← الاسم، رابط المنتج، الصورة، السعر بالباي،
>    المخزون، التقييم). مرفق الشكل اللي بنقترحه، ومعندناش مشكلة نستخدم الـ API الموجود عندكم.
> 2. حدود الاستخدام وأي شروط لذكر اسم سلة.
> 3. لو ممكن، **عمولة إحالة** على الطلبات اللي بنبعتها لكم.
> 4. بعدين: API لإنشاء طلب بعنوان المشتري يرجّع صفحة الدفع بتاعة سلة.
>
> ده هيخلّي منتجات سلة تظهر أسرع وبأسعار مظبوطة لكل مستخدمي دليل باي. شكراً!
>
> [اسمك] — دليل باي

### Map of Pi — via the "Let's Connect" form on https://mapofpi.com
(or X [@mapofpi](https://x.com/mapofpi), their Telegram, or [github.com/map-of-pi](https://github.com/map-of-pi))

> Hi Map of Pi team,
>
> I'm building **Dalil Pi** (https://pihackathontest.vercel.app), an AI shopping assistant for Pi
> users, for the Pi Next hackathon. When a user asks for something "near me", we'd love to show
> **Map of Pi sellers** — with the shop name, address, distance, rating and item prices — and send
> the user to the seller's page in the Map of Pi app to buy.
>
> Could we get permission to call your API read-only from our server (`/sellers/fetch`,
> `/sellers/{id}`, `/sellers/item/{id}`), plus the production API URL, an API key if you prefer,
> and your rate limit? Every result will say "Listed on Map of Pi" and link back to your app. We
> skip test, inactive and restricted sellers and don't store any seller data.
>
> It would bring more Pi buyers to Map of Pi sellers. Thank you!
>
> [Your name] — Dalil Pi

### Map of Pi — بالعربي

> أهلاً فريق Map of Pi،
>
> أنا بطوّر **دليل باي** (https://pihackathontest.vercel.app)، مساعد تسوّق بالذكاء الاصطناعي
> لمستخدمي باي، لهاكاثون Pi Next. لما المستخدم يطلب حاجة "قريبة مني"، عاوزين نعرض **بائعين Map of Pi**
> باسم المحل والعنوان والمسافة والتقييم وأسعار المنتجات، ونودّي المستخدم لصفحة البائع في تطبيق
> Map of Pi علشان يشتري.
>
> ممكن نستأذن نستخدم الـ API بتاعكم للقراءة بس من السيرفر بتاعنا (`/sellers/fetch` و`/sellers/{id}`
> و`/sellers/item/{id}`)، مع رابط الـ API الأساسي، ومفتاح لو تحبوا، وحدود الاستخدام؟ كل نتيجة هتكتب
> "Listed on Map of Pi" وترجع لتطبيقكم، ومش هنعرض البائعين التجريبيين أو الموقوفين، ومش هنخزّن بيانات
> البائعين.
>
> ده هيجيب مشترين باي أكتر لبائعين Map of Pi. شكراً!
>
> [اسمك] — دليل باي
