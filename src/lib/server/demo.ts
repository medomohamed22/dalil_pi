import "server-only";
import { rankOffers, type RawOffer } from "./rank";
import { prepareOffers } from "./sign";
import { formatMoney } from "../i18n";
import { barcodeIn } from "./barcode";
import { priceInsight } from "./insight";
import type { AgentEvent, Lang, Market, Step } from "../types";

/**
 * Demo mode: a scripted agent over a small seeded catalog, so judges can try
 * the full flow (search → compare → approve → PayPal) without an LLM key.
 * All prices here are illustrative sample data.
 */
interface DemoProduct {
  keys: string[];
  /** Sample EAN-13 codes that map to this product in demo mode. */
  barcodes?: string[];
  name: string;
  offers: Record<Market, RawOffer[]>;
}

const s = (store: string, q: string) => {
  const m: Record<string, string> = {
    "Amazon.eg": `https://www.amazon.eg/s?k=${q}`,
    Noon: `https://www.noon.com/egypt-en/search/?q=${q}`,
    "B.TECH": `https://btech.com/en/catalogsearch/result/?q=${q}`,
    "2B": `https://2b.com.eg/en/catalogsearch/result/?q=${q}`,
    Jumia: `https://www.jumia.com.eg/catalog/?q=${q}`,
    Amazon: `https://www.amazon.com/s?k=${q}`,
    "Best Buy": `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,
    Walmart: `https://www.walmart.com/search?q=${q}`,
    Target: `https://www.target.com/s?searchTerm=${q}`,
  };
  return m[store] ?? `https://dalil-demo.store/p/${q}`;
};

const CATALOG: DemoProduct[] = [
  {
    keys: ["iphone", "ايفون", "آيفون"],
    barcodes: ["0195950000016"],
    name: "iPhone 17 Pro 256GB",
    offers: {
      EG: [
        { title: "Apple iPhone 17 Pro 256GB – Cosmic Orange", store: "B.TECH", url: s("B.TECH", "iphone+17+pro"), price: 74999, currency: "EGP", shipping: 0, rating: 4.7, reviewCount: 412, distanceKm: 3.2, pickup: true, notes: "Official warranty, in stock at Nasr City branch" },
        { title: "Apple iPhone 17 Pro 256GB", store: "Amazon.eg", url: s("Amazon.eg", "iphone+17+pro"), price: 73850, currency: "EGP", shipping: 0, rating: 4.6, reviewCount: 1280, deliveryDays: 2, notes: "Sold by Amazon, Prime delivery" },
        { title: "iPhone 17 Pro 256GB (Middle East version)", store: "Noon", url: s("Noon", "iphone+17+pro"), price: 72990, currency: "EGP", shipping: 150, rating: 4.5, reviewCount: 640, deliveryDays: 3 },
        { title: "Apple iPhone 17 Pro 256GB", store: "2B", url: s("2B", "iphone+17+pro"), price: 75499, currency: "EGP", shipping: 0, rating: 4.8, reviewCount: 96, distanceKm: 1.4, pickup: true, notes: "Pickup today from Heliopolis" },
        { title: "iPhone 17 Pro 256GB – HOT SALE", store: "mega-phones-deals.shop", url: "https://mega-phones-deals.shop/iphone17pro", price: 39999, currency: "EGP", listPrice: 79999, shipping: 0, rating: 5, reviewCount: 7, notes: "50% off, payment by transfer only" },
      ],
      US: [
        { title: "Apple iPhone 17 Pro 256GB", store: "Apple", url: "https://www.apple.com/shop/buy-iphone", price: 1099, currency: "USD", shipping: 0, rating: 4.8, reviewCount: 2100, deliveryDays: 2 },
        { title: "Apple iPhone 17 Pro 256GB (Unlocked)", store: "Best Buy", url: s("Best Buy", "iphone+17+pro"), price: 1079, currency: "USD", shipping: 0, rating: 4.7, reviewCount: 880, distanceKm: 4.1, pickup: true },
        { title: "Apple iPhone 17 Pro 256GB", store: "Amazon", url: s("Amazon", "iphone+17+pro"), price: 1089, currency: "USD", shipping: 0, rating: 4.6, reviewCount: 3150, deliveryDays: 1 },
        { title: "iPhone 17 Pro 256GB – Factory Sealed", store: "Walmart", url: s("Walmart", "iphone+17+pro"), price: 1069, currency: "USD", shipping: 9.99, rating: 4.3, reviewCount: 210, deliveryDays: 4 },
      ],
    },
  },
  {
    keys: ["airpods", "ايربودز", "سماعة"],
    barcodes: ["0195949000010"],
    name: "AirPods Pro 3",
    offers: {
      EG: [
        { title: "Apple AirPods Pro 3", store: "Amazon.eg", url: s("Amazon.eg", "airpods+pro+3"), price: 12499, currency: "EGP", shipping: 0, rating: 4.7, reviewCount: 950, deliveryDays: 1 },
        { title: "Apple AirPods Pro 3 with USB‑C case", store: "Noon", url: s("Noon", "airpods+pro+3"), price: 11999, currency: "EGP", shipping: 0, rating: 4.6, reviewCount: 520, deliveryDays: 2 },
        { title: "AirPods Pro 3", store: "B.TECH", url: s("B.TECH", "airpods+pro+3"), price: 12999, currency: "EGP", shipping: 0, rating: 4.8, reviewCount: 130, distanceKm: 2.7, pickup: true },
        { title: "AirPods Pro 3", store: "Jumia", url: s("Jumia", "airpods+pro+3"), price: 12150, currency: "EGP", shipping: 60, rating: 4.2, reviewCount: 88, deliveryDays: 4 },
      ],
      US: [
        { title: "Apple AirPods Pro 3", store: "Amazon", url: s("Amazon", "airpods+pro+3"), price: 219, currency: "USD", shipping: 0, rating: 4.7, reviewCount: 12400, deliveryDays: 1 },
        { title: "Apple AirPods Pro 3", store: "Target", url: s("Target", "airpods+pro+3"), price: 229, currency: "USD", shipping: 0, rating: 4.6, reviewCount: 980, distanceKm: 2.2, pickup: true },
        { title: "Apple AirPods Pro 3", store: "Best Buy", url: s("Best Buy", "airpods+pro+3"), price: 224.99, currency: "USD", shipping: 0, rating: 4.8, reviewCount: 2300, distanceKm: 4.1, pickup: true },
        { title: "AirPods Pro 3 (refurb, like new)", store: "airdeals-outlet.net", url: "https://airdeals-outlet.net/app3", price: 99, listPrice: 249, currency: "USD", shipping: 0, rating: 4.9, reviewCount: 11 },
      ],
    },
  },
  {
    keys: ["air fryer", "قلاية", "fryer"],
    barcodes: ["8710103000013"],
    name: "Air fryer",
    offers: {
      EG: [
        { title: "Philips Airfryer XL HD9270 6.2L", store: "B.TECH", url: s("B.TECH", "philips+airfryer"), price: 3899, currency: "EGP", shipping: 0, rating: 4.7, reviewCount: 610, distanceKm: 3.2, pickup: true },
        { title: "Tornado Air Fryer 5.5L", store: "Amazon.eg", url: s("Amazon.eg", "tornado+air+fryer"), price: 2799, currency: "EGP", shipping: 0, rating: 4.4, reviewCount: 2050, deliveryDays: 1 },
        { title: "Black+Decker Air Fryer 4L", store: "Noon", url: s("Noon", "black+decker+air+fryer"), price: 2450, currency: "EGP", shipping: 50, rating: 4.3, reviewCount: 730, deliveryDays: 3 },
      ],
      US: [
        { title: "Ninja Air Fryer Pro 5-in-1 5QT", store: "Amazon", url: s("Amazon", "ninja+air+fryer"), price: 99.99, currency: "USD", shipping: 0, rating: 4.8, reviewCount: 41000, deliveryDays: 1 },
        { title: "COSORI Pro II 5.8QT", store: "Walmart", url: s("Walmart", "cosori+air+fryer"), price: 89, currency: "USD", shipping: 0, rating: 4.7, reviewCount: 9800, deliveryDays: 2 },
        { title: "Instant Vortex Plus 6QT", store: "Target", url: s("Target", "instant+vortex"), price: 109.99, currency: "USD", shipping: 0, rating: 4.6, reviewCount: 3100, distanceKm: 2.2, pickup: true },
      ],
    },
  },
];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      res();
    });
  });

export async function runDemo(opts: {
  text: string;
  hasImage: boolean;
  market: Market;
  city: string;
  lang: Lang;
  signal?: AbortSignal;
  emit: (e: AgentEvent) => void;
}): Promise<void> {
  const { market, city, lang, emit, signal } = opts;
  const code = barcodeIn(opts.text);
  const q = (code ? opts.text.replace(/[\d٠-٩ ]{8,}/g, " ") : opts.text).toLowerCase();
  const product =
    (code ? CATALOG.find((p) => p.barcodes?.includes(code)) : undefined) ??
    CATALOG.find((p) => p.keys.some((k) => q.includes(k))) ??
    (code || opts.hasImage ? CATALOG[1] : CATALOG[0]);
  const wantsCart = /\b(cart|basket)\b|(^|\s)(ال|في\s?ال)?سل[ةه](\s|$)/.test(q);
  const wantsFamily = /\b(family|mom|dad|parents?|mother|father)\b|ماما|بابا|أمي|امي|أبويا|ابويا|أهلي|اهلي|العيلة|العيله|موافقة/.test(q);
  if (wantsCart) return runDemoCart({ ...opts, q });
  const wantsWatch = /watch|track|راقب|تابع|لو نزل|if it drops|under|تحت/.test(q);
  const wantsBuy = (/\b(buy|order|purchase|negotiate|haggle)\b|اشتري|اشتريه|اطلب|فاوض/.test(q) || wantsFamily) && !wantsWatch;
  const wantsAuto = wantsWatch && /\b(buy|auto)\b|اشتري|اشتريها|اشتريه|تلقائي/.test(q);
  // Numbers in the message (Arabic-Indic digits too) → target price.
  const nums = (q.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,٬]/g, "").match(/\d+(\.\d+)?/g) ?? [])
    .map(Number)
    .filter((n) => n >= 20);

  const say = async (s: string) => {
    const chars = Array.from(s);
    for (let i = 0; i < chars.length; i += 6) {
      const part = chars.slice(i, i + 6).join("");
      if (signal?.aborted) return;
      emit({ type: "text", delta: part });
      await wait(18, signal);
    }
  };

  const steps: Array<Omit<Step, "status">> = [
    ...(code ? [{ id: "db", tool: "lookup_barcode", label: "lookup_barcode", detail: `${code} → ${product.name}` }] : []),
    ...(opts.hasImage ? [{ id: "d0", tool: "identify_image", label: "identify_image", detail: product.name }] : []),
    { id: "d1", tool: "web_search", label: "web_search", detail: `${product.name} price ${city}` },
    ...product.offers[market].slice(0, 3).map((o, i) => ({
      id: `d2${i}`,
      tool: "browse_url",
      label: "browse_url",
      detail: o.url ? new URL(o.url).hostname.replace(/^www\./, "") : o.store,
    })),
    { id: "d3", tool: "deal_check", label: "deal_check", detail: `${product.offers[market].length} offers` },
  ];

  const hosts = product.offers[market]
    .map((o) => (o.url ? new URL(o.url).hostname.replace(/^www\./, "") : ""))
    .filter(Boolean);
  for (const st of steps) {
    if (signal?.aborted) return;
    emit({ type: "step", step: { ...st, status: "running" } });
    await wait(650, signal);
    emit({ type: "step", step: { ...st, status: "done", hosts: st.tool === "web_search" ? hosts : undefined } });
    if (st.tool === "web_search") {
      emit({
        type: "thought",
        text: lang === "ar" ? `لقيت ${hosts.length} متاجر، بقارن الأسعار والشحن…` : `Found ${hosts.length} stores, comparing prices and shipping…`,
      });
    }
  }

  const ranked = prepareOffers(rankOffers(product.offers[market], market));
  emit({ type: "block", block: { type: "products", offers: ranked, note: "demo" } });

  const best = ranked.find((o) => o.trust !== "suspicious")!;
  const insight = await priceInsight({ title: best.title, url: best.url, price: best.price, currency: best.currency, market, demo: true });
  emit({ type: "block", block: { type: "insight", offer: best, insight } });
  const sus = ranked.find((o) => o.trust === "suspicious" || o.flags.includes("suspicious_discount"));
  const money = formatMoney(best.total, best.currency, lang);

  if (lang === "ar") {
    await say(
      `أفضل اختيار: **${best.store}** بإجمالي ${money} (السعر + الشحن)، وده أحسن توازن بين السعر والتقييم وثقة المتجر.` +
        (sus ? `\n\n> **خلي بالك:** عرض **${sus.store}** شكله وهمي — السعر أقل من السوق بكتير والتقييمات قليلة.` : "") +
        `\n\n_بيانات تجريبية (Demo mode)._`,
    );
  } else {
    await say(
      `Best pick: **${best.store}** at ${money} total (price + shipping) — the best balance of price, rating and store trust.` +
        (sus ? `\n\n> **Heads up:** the **${sus.store}** offer looks fake — far below market price with very few reviews.` : "") +
        `\n\n_Sample data (Demo mode)._`,
    );
  }

  if (wantsBuy) {
    if (wantsFamily) {
      await say(
        lang === "ar"
          ? `\n\nجهزتلك طلب شراء — اضغط **اطلب موافقة العيلة**، حط حد للصرف، وابعت اللينك. هما بيوافقوا ويدفعوا من حساب PayPal بتاعهم.`
          : `\n\nI drafted the purchase — tap **Ask family to approve**, set a spending limit and send the link. They approve and pay from their own PayPal account.`,
      );
    }
    emit({ type: "block", block: { type: "approval", offer: best, status: "pending", ...(wantsFamily ? { suggest: "family" as const } : {}) } });
  }
  if (wantsWatch) {
    const target = nums.length ? Math.max(...nums) : Math.floor(best.price * 0.93);
    emit({ type: "block", block: { type: "watchDraft", offer: best, targetPrice: target, mode: wantsAuto ? "auto" : "notify" } });
  }
}

/**
 * Demo: a multi-store cart. Finds the best trustworthy offer for each product
 * the user named (AirPods + air fryer by default) and puts them in one cart —
 * one PayPal approval, one hold per store.
 */
async function runDemoCart(opts: {
  q: string;
  market: Market;
  city: string;
  lang: Lang;
  signal?: AbortSignal;
  emit: (e: AgentEvent) => void;
}): Promise<void> {
  const { q, market, city, lang, emit, signal } = opts;
  let products = CATALOG.filter((p) => p.keys.some((k) => q.includes(k)));
  if (products.length < 2) products = [CATALOG[1], CATALOG[2]].filter((p) => !products.includes(p)).concat(products).slice(0, 2);
  const picks: ReturnType<typeof prepareOffers> = [];
  const shown: ReturnType<typeof prepareOffers> = [];
  for (const [n, product] of products.entries()) {
    const steps: Array<Omit<Step, "status">> = [
      { id: `c${n}1`, tool: "web_search", label: "web_search", detail: `${product.name} price ${city}` },
      { id: `c${n}2`, tool: "deal_check", label: "deal_check", detail: `${product.offers[market].length} offers` },
    ];
    for (const st of steps) {
      if (signal?.aborted) return;
      emit({ type: "step", step: { ...st, status: "running" } });
      await wait(550, signal);
      emit({ type: "step", step: { ...st, status: "done" } });
    }
    const ranked = prepareOffers(rankOffers(product.offers[market], market));
    // One offer list for the whole cart (a newer list replaces the cards in place).
    shown.push(...ranked);
    emit({ type: "block", block: { type: "products", offers: [...shown], note: "demo" } });
    // Prefer a different store for each item when one is nearly as good — that's the point of a multi-store cart.
    const fair = ranked.filter((o) => o.trust !== "suspicious" && !o.flags.includes("suspicious_discount"));
    const used = new Set(picks.map((p) => p.store));
    const best = fair[0];
    // Up to 15% more is still a fair pick when it means the cart really spans stores.
    const alt = fair.find((o) => !used.has(o.store) && o.total <= best.total * 1.15);
    if (best) picks.push(used.has(best.store) && alt ? alt : best);
  }
  if (signal?.aborted || !picks.length) return;
  const stores = new Set(picks.map((p) => p.store)).size;
  const total = picks.reduce((a, o) => a + o.total, 0);
  const money = formatMoney(Math.round(total * 100) / 100, picks[0].currency, lang);
  const text =
    lang === "ar"
      ? `حطيت أفضل عرض لكل منتج في سلة واحدة: ${picks.length} منتجات من ${stores === 1 ? "متجر واحد" : `${stores} متاجر`} بإجمالي ${money}. **موافقة واحدة في PayPal** وكل متجر بيتحجزله المبلغ بتاعه لوحده — تقدر تلغي أي متجر خلال 10 دقايق.\n\n_بيانات تجريبية (Demo mode)._`
      : `I put the best offer for each item in one cart: ${picks.length} items from ${stores} store${stores === 1 ? "" : "s"}, ${money} total. **One PayPal approval** — each store gets its own hold, so you can cancel any store within 10 minutes.\n\n_Sample data (Demo mode)._`;
  for (const part of Array.from(text).reduce<string[]>((a, ch, i) => (i % 6 ? ((a[a.length - 1] += ch), a) : [...a, ch]), [])) {
    if (signal?.aborted) return;
    emit({ type: "text", delta: part });
    await wait(18, signal);
  }
  emit({ type: "block", block: { type: "cart", offers: picks, status: "pending" } });
}
