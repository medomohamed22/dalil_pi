import type { Lang } from "./types";

const strings = {
  en: {
    tagline: "Your trustworthy AI shopping agent",
    newChat: "New chat",
    chats: "Chats",
    watches: "Price watches",
    settings: "Settings",
    placeholder: "A product name, link, or photo…",
    send: "Send",
    attach: "Attach photo",
    stop: "Stop",
    emptyTitle: "What are you looking for?",
    emptySub:
      "Send a product photo, link or name. Dalil compares prices online and in your city, checks for fake deals, and only pays with your approval.",
    suggestions: [
      "Find the cheapest iPhone 17 Pro 256GB near me",
      "Watch AirPods Pro 3 and buy if it drops under $199",
      "Is this deal real? ",
      "Best-rated air fryer under $120",
    ],
    apiSection: "Meta Model API",
    baseUrl: "Base URL",
    apiKey: "API key",
    show: "Show",
    hide: "Hide",
    fetchModels: "Fetch models",
    fetching: "Fetching…",
    model: "Model",
    reasoning: "Reasoning effort",
    shoppingSection: "Shopping",
    market: "Market",
    city: "City",
    language: "Language",
    demoMode: "Demo mode (no API key needed)",
    save: "Save",
    saved: "Saved",
    keyLocal: "Stored only on this device (IndexedDB). Sent with each request, never stored on the server.",
    modelsFound: (n: number) => `${n} models found`,
    modelsFailed: "Could not fetch models — showing known models.",
    needKey: "The AI is offline right now (the server has no Meta key configured).",
    hostedLimit: "Daily AI limit reached for this connection — please try again tomorrow.",
    cheapest: "Cheapest",
    topRated: "Top rated",
    bestValue: "Best value",
    nearest: "Nearest",
    verified: "Verified store",
    suspicious: "Suspicious",
    unknownStore: "Unverified",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    pickup: "Pickup",
    km: "km",
    days: "days",
    reviews: "reviews",
    view: "View",
    buy: "Buy",
    approveTitle: "Approve purchase",
    approveNote: "Funds are only held (authorized). You can cancel before capture.",
    approveBtn: "Approve with PayPal",
    decline: "Decline",
    declined: "Declined",
    held: "Funds held",
    captured: "Purchased",
    voided: "Cancelled — hold released",
    processing: "Processing…",
    cancelHold: "Cancel & release hold",
    confirmCapture: "Confirm now",
    shipTo: "Ships to your PayPal address",
    item: "Item",
    working: "Dalil is working",
    copied: "Copied",
    deleteChat: "Delete chat",
  },
  ar: {
    tagline: "وكيل تسوّق ذكي تقدر تثق فيه",
    newChat: "محادثة جديدة",
    chats: "المحادثات",
    watches: "مراقبة الأسعار",
    settings: "الإعدادات",
    placeholder: "اسم منتج، لينك، أو صورة…",
    send: "إرسال",
    attach: "إرفاق صورة",
    stop: "إيقاف",
    emptyTitle: "بتدوّر على إيه؟",
    emptySub:
      "ابعت صورة المنتج أو لينكه أو اسمه. دليل بيقارن الأسعار أونلاين وفي مدينتك، ويكشف العروض الوهمية، ومابيدفعش غير بموافقتك.",
    suggestions: [
      "دوّرلي على أرخص iPhone 17 Pro 256GB في القاهرة",
      "راقب AirPods Pro 3 واشتريها لو نزلت تحت ٨٠٠٠ جنيه",
      "العرض ده حقيقي ولا وهمي؟ ",
      "أحسن قلاية هوائية تقييمًا تحت ٤٠٠٠ جنيه",
    ],
    apiSection: "Meta Model API",
    baseUrl: "عنوان الـ API",
    apiKey: "مفتاح الـ API",
    show: "إظهار",
    hide: "إخفاء",
    fetchModels: "جلب النماذج",
    fetching: "جاري الجلب…",
    model: "النموذج",
    reasoning: "مستوى التفكير",
    shoppingSection: "التسوّق",
    market: "السوق",
    city: "المدينة",
    language: "اللغة",
    demoMode: "وضع العرض التجريبي (من غير مفتاح)",
    save: "حفظ",
    saved: "اتحفظ",
    keyLocal: "محفوظ على الجهاز ده بس (IndexedDB). بيتبعت مع كل طلب ومش بيتخزن على السيرفر.",
    modelsFound: (n: number) => `تم العثور على ${n} نموذج`,
    modelsFailed: "معرفناش نجيب النماذج — دي النماذج المعروفة.",
    needKey: "ضيف مفتاح Meta API من الإعدادات، أو فعّل وضع العرض التجريبي.",
    hostedLimit: "خلصت المحاولات المجانية النهارده. ضيف مفتاحك من الإعدادات أو جرّب وضع العرض التجريبي.",
    cheapest: "الأرخص",
    topRated: "الأعلى تقييمًا",
    bestValue: "أفضل قيمة",
    nearest: "الأقرب",
    verified: "متجر موثوق",
    suspicious: "مشبوه",
    unknownStore: "غير موثّق",
    shipping: "الشحن",
    free: "مجاني",
    total: "الإجمالي",
    pickup: "استلام",
    km: "كم",
    days: "أيام",
    reviews: "تقييم",
    view: "عرض",
    buy: "شراء",
    approveTitle: "الموافقة على الشراء",
    approveNote: "المبلغ بيتحجز بس (Authorize). تقدر تلغي قبل الخصم.",
    approveBtn: "وافق وادفع بـ PayPal",
    decline: "رفض",
    declined: "اترفض",
    held: "المبلغ محجوز",
    captured: "تم الشراء",
    voided: "اتلغى — الحجز اتفك",
    processing: "جاري التنفيذ…",
    cancelHold: "إلغاء وفك الحجز",
    confirmCapture: "تأكيد الآن",
    shipTo: "الشحن على عنوانك في PayPal",
    item: "المنتج",
    working: "دليل بيشتغل",
    copied: "اتنسخ",
    deleteChat: "حذف المحادثة",
  },
} as const;

export type Strings = (typeof strings)["en"];

export function t(lang: Lang): Strings {
  return strings[lang] as unknown as Strings;
}

/** Locale for numbers: the Arabic UI keeps Latin digits (clearer for prices & models). */
export function numLocale(lang: Lang): string {
  return lang === "ar" ? "ar-EG-u-nu-latn" : "en-US";
}

export function formatMoney(amount: number, currency: string, lang: Lang): string {
  const cur = currency.toUpperCase();
  const digits = amount % 1 === 0 ? 0 : 2;
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (cur === "USD") return `$${num}`;
  if (cur === "EGP") return lang === "ar" ? `${num} ج.م` : `EGP ${num}`;
  try {
    return new Intl.NumberFormat(numLocale(lang), { style: "currency", currency: cur, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${num} ${cur}`;
  }
}
