# Pi Dalil — الخطة الكاملة (بحث + تسعير + تنفيذ)

> تاريخ البحث: 7 نوفمبر 2026 · الكود الأساسي: Fork من [Dalil (PayPal AI)](https://github.com/medomohamed22/PayPal_Ai) commit `904d3d6`
> القرارات: **Meta Model API** بموديل **`muse-spark-1.3-contributor`** · الدفع **مباشر لمتجر البائع** (مش لمحفظتنا) · ربح الموقع من **باقات شهرية بالـ Pi** مربوطة بسعر **OKX**.

---

## 1. نتائج البحث — منين بنشتري بـ Pi؟

### 1.1 المصادر اللي هنبحث فيها

| المصدر | النوع | إيه اللي عنده | ملاحظات من البحث |
|---|---|---|---|
| **Salla Shop Mall** — `mall.salla-shop.com` | 🟢 أونلاين (مصري، متعدد البائعين) | Mall، Services، Food، Local، Pay، Go (شحن)، Swap (مقايضة)، Care (دكاترة/أدوية)، Telegram Stars/Premium، Browser | بيستخدم Pi SDK رسمي (`sdk.minepi.com`)، مسجّل في `ecosystem.pinet.com`، **Escrow**: فلوس التاجر بتتحول بعد تأكيد الاستلام أو 3 أيام. عنده `merchant_trust_summary`، تقييمات للمنتجات والتجار والخدمات، سعر Pi معتمد بيتحدث تلقائياً |
| **Sallanet Pay** (بوابة دفع Salla) | 🟢 متاجر خارجية بتقبل Pi | Hosted Checkout API + **WooCommerce plugin** + Webhooks (HMAC) + Refund | أي متجر WordPress عليه البلجن ده = متجر بيقبل Pi رسمياً. `extapi-create-checkout` بيرجّع `checkout_url` للمتجر نفسه |
| **Pi Chain Mall (PCM)** | 🟢 أونلاين | سوق متعدد المتاجر، 100+ دولة | فائز هاكاثون Pi الأول (2021). لازم نتأكد من الرابط الحالي جوه Pi Browser |
| **Piketplace** — `piketplace.com` | 🟢 أونلاين | Mainnet Shop + FestMAP | وصيف هاكاثون 2023 |
| تطبيقات Mainnet تجارية في Pi Browser | 🟢 أونلاين | متاجر متفرقة (Pi Shop، 1Pi Mall، Youpi، Daabia، Store on Pi…) | بنضيفها واحدة واحدة بعد التحقق (قائمة Allowlist) |
| **Map of Pi** | 📍 **محلي فقط** | محلات على أرض الواقع + منتجات بأسعار Pi + تقييمات + `trust_meter_rating` | API مفتوح المصدر (`/sellers/fetch`، `/sellers/item/{id}`، `/review-feedback/{id}`). **بيتبحث فيه بس لما المستخدم يطلب محلي** |
| **Salla Local / Salla Map** | 📍 محلي | محلات أوفلاين بتقبل Pi بالكود | نفس شرط Map of Pi |
| **شركاء Pi Dalil** | 🟢 | متاجر بتسجل عندنا بـ Merchant API | طلب تلقائي كامل |

> ⚠️ **مفيش قائمة رسمية من Pi بالمتاجر اللي بتقبل Pi** — علشان كده الـ Allowlist + معادلة الثقة هما الأساس.

### 1.2 توجيه البحث (Intent Router)

| المستخدم كتب… | بندوّر في |
|---|---|
| منتج بس ("سماعة لاسلكية بـ 500 Pi") **أو** "أونلاين" | Salla Mall → Sallanet Pay stores → Pi Chain Mall → Piketplace → Mainnet allowlist → الشركاء |
| "قريب مني" / "محل" / "في منطقتي" / "near me" / اسم مدينة + "محل" | **Map of Pi + Salla Local** (بموقعه بعد إذنه) |
| خدمة ("عاوز سباك"، "شحن نجوم تليجرام"، "دكتور"، "توصيل طرد"، "أكل") | **Salla Services / Telegram / Care / Go / Food** + الشركاء |
| "بدّل" / "مقايضة" | Salla Swap |

التوجيه **حتمي في كود السيرفر** (كلمات + تصنيف خفيف من الـ AI)، والمستخدم يقدر يغيّره بزرار (أونلاين / محلي / خدمات).

---

## 2. الدفع مباشر لمتجر البائع (مش لمحفظتنا)

**القاعدة:** فلوس المنتج **عمرها ما بتعدي على Pi Dalil**. محفظتنا بتستقبل **اشتراكات الباقات بس**.

**الفكرة:** الـ AI والسيرفر بيجهزوا الطلب عند المتجر (المنتج + بيانات الشحن)، والمتجر يرجّع **رابط الدفع بتاعه هو**. زرار "ادفع" في الكارت بيفتح الرابط ده، والمستخدم يدفع للمتجر من محفظته الرسمية في Pi Browser.

### 2.1 Checkout Connectors (موصّل لكل نوع متجر)

| نوع المتجر | تسجيل الطلب + الشحن | زرار الدفع بيفتح | المستوى |
|---|---|---|---|
| **متجر WooCommerce + Sallanet Pay** | **WooCommerce Store API** (عام، بدون مفاتيح): `GET /wp-json/wc/store/v1/cart` ← `Cart-Token` · `POST …/cart/add-item` · `POST …/checkout` بـ `billing_address` + `shipping_address` + `payment_method` بتاع Sallanet ← الرد فيه `payment_result.redirect_url` | **Hosted Checkout بتاع Sallanet للمتجر نفسه** (الفلوس للتاجر عبر Escrow Salla) | ✅ أوتوماتيك 100% |
| **Salla Shop Mall** | **شراكة مطلوبة** (API لإنشاء طلب نيابة عن المستخدم). لحد ما تحصل: Deep link لصفحة المنتج + كارت "بيانات الشحن" بزرار نسخ | صفحة الدفع في Salla (Escrow بتاعهم) | 🟡 نص أوتوماتيك ← ✅ بعد الشراكة |
| **Pi Chain Mall / Piketplace / تطبيقات Mainnet** | Deep link للمنتج + كارت بيانات الشحن (نسخ بدوسة) · لاحقاً شراكات | تطبيق المتجر في Pi Browser | 🟡 |
| **Map of Pi / Salla Local (محلي)** | صفحة المحل + الاتجاهات + اتصال · طلب أونلاين لو المحل مفعّله | Map of Pi / الدفع في المحل | 🟡 |
| **شركاء Pi Dalil** (Merchant API بتاعنا) | `POST {merchant}/pi-dalil/orders` (المنتج + الشحن + `order_ref`) ← التاجر يرجع `checkout_url` **أو** `{wallet, memo}` | صفحة دفع التاجر **أو** `Pi.Wallet.submitTransaction(xdr)` لمحفظة التاجر بـ memo = رقم الطلب | ✅ |

**بديل الدفع المباشر على البلوكتشين** (`Pi.Wallet.submitTransaction`): لو التاجر شريك وإدّانا عنوان محفظته، نبني معاملة XDR (المستخدم ← التاجر، memo = رقم الطلب)، والمحفظة توقّعها، والتاجر يتأكد من الـ memo. **⚠️ لازم نجربها على Testnet**، لأن التوثيق مش واضح إذا كانت المحفظة بتوقّع XDR فيه وجهة خارجية.

### 2.2 بيانات الشحن — الـ AI بيكتبها، بس **بياناتك عمرها ما بتروح للموديل**
- البروفايل (الاسم، التليفون، العنوان، المدينة، الدولة) محفوظ على الجهاز (IndexedDB).
- الـ AI بيقرر **"هنطلب من المتجر X المنتج Y"**، والسيرفر (Connector) هو اللي **بيحط البيانات في الطلب** بشكل حتمي.
- **السبب:** موديل `contributor` معناه إن **Meta ممكن تتدرب على الـ prompts**. علشان كده الاسم والعنوان والتليفون **ممنوع يدخلوا الـ prompt**. (لازم يتكتب في سياسة الخصوصية إن نص البحث بيروح لـ Meta.)
- قبل الإرسال: شاشة تأكيد "هنبعت الاسم/العنوان/التليفون للمتجر X" ← موافقة ← إرسال.

---

## 3. معادلة الثقة (Pi Trust Score) — تحديث بالمصادر الحقيقية

نفس المعادلة اللي في `PI_DALIL_DESIGN.md`:
```
Trust = round(100 × (0.25·O + 0.20·R + 0.20·W + 0.15·P + 0.10·D + 0.10·F)) − Penalties
```
ربط الإشارات بالمصادر:

| الإشارة | Salla | Map of Pi | Sallanet Woo store | ويب/Mainnet |
|---|---|---|---|---|
| **O** رسمي | 0.9 (Pi SDK + pinet ecosystem) | 0.9 | 0.8 (بوابة Pi معروفة) | 0.2–0.9 حسب الـ Allowlist |
| **R** تقييمات | `merchant_product_reviews` + `reviews` (Bayesian) | `review-feedback` | تقييمات WooCommerce `/products/reviews` | — |
| **W** محفظة | لو متاح | لو متاح | — | Pi Horizon |
| **P** السعر | مقارنة بنفس المنتج في المصادر التانية + سعر السوق بالدولار (OKX) | ← | ← | ← |
| **D** الدومين | HTTPS + عمر الدومين (RDAP) | ← | ← | ← |
| **F** التنفيذ | `merchant_trust_summary` (عدد الطلبات/النزاعات) | `trust_meter_rating` | — | سجل Pi Dalil |

---

## 4. التكلفة والتسعير

### 4.1 سعر Pi (OKX)
- Endpoint عام بدون مفتاح: `GET https://www.okx.com/api/v5/market/ticker?instId=PI-USDT`
- **اتجرب النهارده:** `last = 0.07497 USDT` · أعلى سعر في 24 ساعة 0.07561 · أقل سعر 0.0736
- السيرفر يخزّن السعر في الكاش 60 ثانية. سعر الباقة بالـ Pi بيتحسب لحظة الشراء وبيفضل ثابت **10 دقائق** (Quote موقّع HMAC زي العروض في Dalil).
- **سعر الحماية:** `P_ref = min(last, متوسط آخر ساعة)`. لو OKX مش شغال نستخدم آخر سعر محفوظ (لو عمره أقل من 15 دقيقة)، وغير كده نوقف البيع مؤقتاً.

### 4.2 تكلفة الـ AI (Meta `muse-spark-1.3-contributor`)
| البند | السعر |
|---|---|
| Input | **$0.10 / مليون توكن** |
| Output | **$0.20 / مليون توكن** |
| للمقارنة: `muse-spark-1.3` العادي | $1.25 input / $4.25 output (أغلى ~12–20×) |

> المصادر أسعار من مواقع تجميع (مش صفحة Meta الرسمية). **لازم نتأكد من لوحة Meta قبل الإطلاق.**

**تقدير طلب البحث الواحد** (مبني على كود Dalil: لوب لحد 10 جولات، الأداة بترجع لحد 2500–5000 حرف من كل صفحة، والسياق بيكبر مع كل جولة):

| السيناريو | Input | Output | التكلفة |
|---|---|---|---|
| عادي (4–5 جولات) | ~60K | ~3K | $0.0060 + $0.0006 = **~$0.007** |
| تقيل (10 جولات + متصفح + بحث ويب) | ~150K | ~6K | $0.015 + $0.0012 = **~$0.017** |
| **نحسب على أساس** | | | **$0.008 متوسط · $0.020 أسوأ حالة** |

**تشغيل لكل بحث:** Vercel (CPU نشط + ذاكرة)، Redis (~20 أمر = $0.00004)، Chromium ⇒ **~$0.001**
**طلب تلقائي (Connector):** ~$0.002

### 4.3 تكاليف ثابتة شهرياً
| البند | التكلفة |
|---|---|
| Vercel **Pro** (لازم لأن Hobby مش للاستخدام التجاري) — مقعد واحد، ومعاه رصيد استخدام | $20 |
| Upstash Redis (Pay-as-you-go، $0.20 لكل 100K أمر، أو Fixed $10) | ~$10 |
| دومين (~$12 في السنة) | ~$1 |
| احتياطي (زيادة استخدام Vercel، Monitoring) | ~$9 |
| **الإجمالي** | **~$40 / شهر** |

### 4.4 الباقات — المعادلة
```
أسوأ_تكلفة = (عدد_البحث × 0.021$) + (عدد_الطلبات × 0.002$) + 0.40$ (نصيب المستخدم من الثابت عند 100 مشترك)
شرط عدم الخسارة:  أسوأ_تكلفة ≤ السعر × 0.90     (هامش 10% لتقلب سعر Pi)
الربح المتوقع:    السعر − (عدد_البحث × 0.009$ + عدد_الطلبات × 0.002$ + 0.40$)
السعر بالـ Pi:     ⌈ السعر_بالدولار ÷ P_ref ⌉  (لأقرب 0.1 Pi)
```

### 4.5 الباقات (بسعر Pi النهارده = $0.07497)

| الباقة | بحث/شهر | طلب تلقائي/شهر | السعر $ | **السعر Pi** | أسوأ تكلفة | تكلفة متوقعة | **صافي ربح متوقع** | الهامش |
|---|---|---|---|---|---|---|---|---|
| 🆓 **مجاني** | 5 (+2 لكل إعلان مكافأة Pi Ad Network) | 2 | 0 | 0 | $0.11 | $0.05 | (تسويق) | — |
| 🥉 **أساسي** | 60 | 20 | $1.99 | **26.6 Pi** | $1.70 ✅ (≤ $1.79) | $0.98 | **$1.01** | 51% |
| 🥈 **بلس** | 180 | 60 | $4.99 | **66.6 Pi** | $4.30 ✅ (≤ $4.49) | $2.14 | **$2.85** | 57% |
| 🥇 **برو** (تجار/محترفين) | 380 | 150 | $9.99 | **133.3 Pi** | $8.68 ✅ (≤ $8.99) | $4.12 | **$5.87** | 59% |
| ➕ **شحن رصيد** | 20 بحث | 5 | $0.79 | **10.6 Pi** | $0.43 | $0.19 | **$0.60** | 76% |

- **كل الباقات مبنية بحيث متخسرش حتى في أسوأ حالة** (كل بحث تقيل)، ومعاها هامش 10% لتقلب السعر.
- الحصة بتتخصم **بعد** ما البحث يرجّع نتايج (لو حصل خطأ مش بتتحسب).
- حدود أمان: أقصى 10 بحث في الساعة، و1 حساب مجاني لكل `uid` في Pi (المستخدمين موثّقين KYC، فمفيش حسابات وهمية).

### 4.6 سيناريو أرباح شهري
| المشتركين | الإيراد | التكلفة المتغيرة | الثابت | **صافي الربح** |
|---|---|---|---|---|
| 30 أساسي (نقطة التعادل تقريباً) | $59.7 | $17.4 | $40 | ~$2 |
| 200 أساسي + 80 بلس + 20 برو | $997 | $330 | $70 (زيادة استخدام) | **~$597** |
| 1000 أساسي + 400 بلس + 100 برو | $4,985 | $1,650 | $200 | **~$3,135** |

**مصدر دخل إضافي (من غير ما يأثر على الترتيب):** عمولة إحالة (Affiliate) من Salla والشركاء. **الترتيب يفضل بدون إعلانات مدفوعة**، لأن ده أساس الثقة.

### 4.7 دفع الاشتراك نفسه
- **U2A** عادي: `Pi.createPayment({ amount: quote.pi, memo: "Pi Dalil Basic", metadata: { plan, quoteSig } })` ← السيرفر يتحقق من الـ Quote (السعر والصلاحية) ← `approve` ← `complete` ← تفعيل 30 يوم.
- ده **مسموح وطبيعي** في Pi: التطبيق بيبيع خدمته، ومش بيمسك فلوس حد تاني.
- ⚠️ علشان تغطي مصاريف الدولار، هتحتاج تحوّل Pi من محفظة التطبيق لـ OKX وتبيعه. خلي بالك من رسوم السحب، وراجع Pi Developer Terms.

---

## 5. المعمارية (Fork من Dalil)

| من Dalil | يحصل له إيه |
|---|---|
| `agent.ts` + `meta.ts` + `hosted.ts` | **يفضلوا** (نفس Meta API والموديل). أدوات جديدة: `search_salla`، `search_sallanet_stores`، `search_pi_malls`، `search_local` (Map of Pi + Salla Local)، `search_services`، `trust_score`، `get_reviews`، `prepare_order` |
| `rank.ts`، `sign.ts`، `browse.ts`، `browser.ts`، `ratelimit.ts` | **يفضلوا** + وزن الثقة + السعر بالـ Pi |
| `cards.tsx`، `MessageView.tsx`، `Composer.tsx`، `i18n.ts` | **يفضلوا** + كارت 🛡️/⭐/تعليقات + زرار "ادفع بـ Pi" + عربي RTL افتراضي |
| `paypal.ts`، `api/paypal/*`، `paypal-client.ts`، `PayPalBridge.tsx`، `PayLater.tsx` | **يتشالوا** ← `pi.ts` (Platform API: `/me`، approve/complete للاشتراكات) + `PiBridge.tsx` (Pi SDK) |
| `channel3.ts` (كتالوج أمريكي) | **يتشال** ← `sources/salla.ts`، `sources/mapofpi.ts`، `sources/woo.ts`، `sources/allowlist.ts` |
| `protection.ts`، `family.ts`، `groups.ts`، `watches.ts`، `negotiate.ts` | **يتوقفوا في الـ MVP** (مبنيين على PayPal hold/vault). نرجعلهم بعد كده |
| جديد | `price/okx.ts`، `billing/plans.ts` + `quota.ts`، `checkout/connectors/*`، `trust.ts`، `profile` (IndexedDB) |

---

## 6. خطة التنفيذ (الهاكاثون بيبدأ 19 نوفمبر)

| # | الفترة | الشغل | جاهز لما… |
|---|---|---|---|
| ✅ 0 | 7 نوفمبر | Fork كود Dalil في المستودع + التصميم + الخطة | ده |
| 1 | 8–11 نوفمبر | شيل PayPal و Channel3 · Pi SDK (Sandbox) + Sign-in with Pi · عربي افتراضي | التطبيق يفتح في Pi Sandbox ويسجّل دخول |
| 2 | 11–14 نوفمبر | `sources/salla.ts` (بحث منتجات + خدمات + تقييمات + ثقة التاجر) · `mapofpi.ts` (محلي) · Intent Router · أدوات الـ agent | "سماعة لاسلكية بـ 500 Pi" ترجع كروت من Salla |
| 3 | 14–17 نوفمبر | `trust.ts` (المعادلة) + كارت 🛡️ ⭐ تعليقات · `okx.ts` + "≈ $" | كروت كاملة بالثقة والتقييم |
| 4 | 17–21 نوفمبر | البروفايل + `woo.ts` Connector (Store API ← Sallanet redirect) + Deep links + كارت بيانات الشحن · Merchant API spec + متجر شريك تجريبي | دوسة "ادفع" تفتح صفحة دفع المتجر نفسه |
| 5 | 21–25 نوفمبر | الباقات + الحصص (Redis) + دفع الاشتراك U2A + Quote موقّع بسعر OKX | تشتري "أساسي" بـ 26.6 Pi والحصة تتفعّل |
| 6 | 25–30 نوفمبر | Demo Tour للحكام + فيديو + README + اختبارات · التقديم حسب شروط Pi Next | جاهز للتسليم |

## 7. حاجات لازم نعملها/نتأكد منها
1. **التواصل مع Salla Shop** (`support@salla-shop.com`). الطلب: (أ) إذن رسمي لاستخدام بيانات المنتجات والتقييمات، (ب) API لإنشاء طلب بالنيابة عن المستخدم، (ج) برنامج Affiliate. العرض بتاعنا: بنجيبلهم مشترين.
2. **Map of Pi:** عنوان الـ API الإنتاجي + الإذن.
3. **Pi Chain Mall:** الرابط الحالي وطريقة الربط.
4. **Meta:** نتأكد من سعر `contributor` من اللوحة الرسمية، وشروط استخدام البيانات للتدريب.
5. **`Pi.Wallet.submitTransaction`:** نجرب الدفع المباشر لعنوان تاجر على Testnet.
6. **Pi Developer Terms:** بيع الاشتراكات بالـ Pi ✅ (U2A عادي)، ونتأكد من مسألة تحويل الـ Pi لـ OKX.
7. **شروط هاكاثون Pi Next** (19 نوفمبر): Mainnet؟ App Studio؟ موعد التسليم؟

## المصادر
- Salla Shop Mall: https://mall.salla-shop.com · API Docs: https://mall.salla-shop.com/api-docs · WooCommerce plugin: https://github.com/moaazelsharkawy/sallanet-pay-woocommerce
- OKX Ticker API: https://www.okx.com/api/v5/market/ticker?instId=PI-USDT
- Muse Spark 1.3 pricing: https://www.layer3labs.io/guides/muse-spark-1-3-pricing · https://www.mindstudio.ai/blog/muse-spark-1-3-pricing · https://aipricecompare.org/api/meta-muse-spark-api-pricing.html
- Vercel pricing: https://makerkit.dev/blog/saas/vercel-cost · Upstash: https://upstash.com/pricing/redis
- WooCommerce Store API: https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/checkout/ · https://developer.woocommerce.com/docs/apis/store-api/cart-tokens/
- Pi Wallet SDK: https://pi-apps.github.io/pi-sdk-docs/pi-sdk/Wallet · Pi Platform docs: https://github.com/pi-apps/pi-platform-docs
- Map of Pi frontend: https://github.com/map-of-pi/map-of-pi-frontend
- Pi Chain Mall: https://www.bitget.com/wiki/how-to-buy-stuff-with-pi-network · Piketplace: https://piketplace.com
