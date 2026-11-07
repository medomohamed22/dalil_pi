import type { Lang } from "./types";

/** UI strings. English is the default language; Arabic is one tap away (RTL). */
const strings = {
  en: {
    appName: "Dalil Pi",
    tagline: "AI shopping agent for Pi — only stores that accept Pi",
    newChat: "New chat",
    chats: "Chats",
    placeholder: "What do you want to buy with Pi?",
    send: "Send",
    attach: "Attach photo",
    stop: "Stop",
    emptyTitle: "What are you looking for?",
    emptySub:
      "Tell Dalil Pi what you need. It searches stores that accept Pi in your country, checks how trustworthy each store is, and shows ratings and reviews.",
    suggestions: [
      "Wireless headphones under 500 Pi",
      "Best price for a new phone charger",
      "Telegram Premium with Pi",
      "Shops near me that accept Pi",
    ],
    signInTitle: "Sign in with Pi",
    signInSub: "Use your Pi account to start. Your free plan includes searches every month.",
    signInBtn: "Sign in with Pi",
    signingIn: "Signing in…",
    openInPiBrowser: "Open Dalil Pi in the Pi Browser to sign in.",
    devSignIn: "Dev sign-in (local only)",
    signOut: "Sign out",
    testnet: "Testnet",
    country: "Country",
    countryAuto: "From my location",
    shoppingIn: "Shopping in",
    change: "Change",
    language: "Language",
    scope: "Search",
    scopes: { auto: "Auto", online: "Online", local: "Near me", services: "Services" },
    searchesLeft: (left: number, limit: number) => `${left} of ${limit} searches left`,
    quotaTitle: "You've used all your free searches this month",
    quotaSub: (date: string) => `Your free searches renew on ${date}. Paid plans are coming soon.`,
    hourly: "You're searching very fast — please wait a little and try again.",
    needKey: "The AI isn't configured on the server yet (META_API_KEY).",
    hostedLimit: "Today's AI limit was reached — please try again tomorrow.",
    signInRequired: "Please sign in with Pi again.",
    cheapest: "Cheapest",
    topRated: "Top rated",
    bestValue: "Best value",
    nearest: "Nearest",
    verified: "Accepts Pi",
    suspicious: "Suspicious",
    unknownStore: "Unverified",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    pickup: "Pickup",
    km: "km",
    days: "days",
    reviews: "reviews",
    view: "Open store",
    payInStore: "Pay with Pi in the store",
    notPi: "Not priced in Pi",
    working: "Dalil Pi is working",
    copied: "Copied",
    deleteChat: "Delete chat",
    piPrice: "Pi price",
  },
  ar: {
    appName: "دليل باي",
    tagline: "وكيل تسوّق ذكي للباي — بس المتاجر اللي بتقبل باي",
    newChat: "محادثة جديدة",
    chats: "المحادثات",
    placeholder: "عاوز تشتري إيه بالباي؟",
    send: "إرسال",
    attach: "إرفاق صورة",
    stop: "إيقاف",
    emptyTitle: "بتدوّر على إيه؟",
    emptySub:
      "قول لدليل باي إنت محتاج إيه. هيدوّر في المتاجر اللي بتقبل باي في بلدك، ويقيّم ثقة كل متجر، ويوريك التقييمات والتعليقات.",
    suggestions: [
      "سماعة لاسلكية في حدود 500 باي",
      "أحسن سعر لشاحن موبايل جديد",
      "تليجرام بريميوم بالباي",
      "محلات قريبة مني بتقبل باي",
    ],
    signInTitle: "سجّل دخول بحساب باي",
    signInSub: "استخدم حساب باي بتاعك علشان تبدأ. الباقة المجانية فيها عمليات بحث كل شهر.",
    signInBtn: "سجّل دخول بباي",
    signingIn: "جاري تسجيل الدخول…",
    openInPiBrowser: "افتح دليل باي من متصفح باي علشان تسجّل دخول.",
    devSignIn: "دخول تجريبي (محلي بس)",
    signOut: "تسجيل خروج",
    testnet: "شبكة تجريبية",
    country: "البلد",
    countryAuto: "من موقعي",
    shoppingIn: "بتتسوّق في",
    change: "غيّر",
    language: "اللغة",
    scope: "البحث",
    scopes: { auto: "تلقائي", online: "أونلاين", local: "قريب مني", services: "خدمات" },
    searchesLeft: (left: number, limit: number) => `فاضل لك ${left} من ${limit} عمليات بحث`,
    quotaTitle: "خلصت عمليات البحث المجانية للشهر ده",
    quotaSub: (date: string) => `البحث المجاني بيتجدد يوم ${date}. الباقات المدفوعة جاية قريب.`,
    hourly: "إنت بتبحث بسرعة جداً — استنى شوية وجرّب تاني.",
    needKey: "الذكاء الاصطناعي لسه مش متظبط على السيرفر (META_API_KEY).",
    hostedLimit: "الحد اليومي للذكاء الاصطناعي خلص — جرّب بكرة.",
    signInRequired: "سجّل دخول بباي تاني من فضلك.",
    cheapest: "الأرخص",
    topRated: "الأعلى تقييمًا",
    bestValue: "أفضل قيمة",
    nearest: "الأقرب",
    verified: "بيقبل باي",
    suspicious: "مشبوه",
    unknownStore: "غير موثّق",
    shipping: "الشحن",
    free: "مجاني",
    total: "الإجمالي",
    pickup: "استلام",
    km: "كم",
    days: "أيام",
    reviews: "تقييم",
    view: "افتح المتجر",
    payInStore: "ادفع بالباي في المتجر",
    notPi: "السعر مش بالباي",
    working: "دليل باي بيشتغل",
    copied: "اتنسخ",
    deleteChat: "حذف المحادثة",
    piPrice: "سعر الباي",
  },
};

export type Strings = (typeof strings)["en"];

export function t(lang: Lang): Strings {
  return strings[lang] as Strings;
}

/** Locale for numbers: the Arabic UI keeps Latin digits (clearer for prices & models). */
export function numLocale(lang: Lang): string {
  return lang === "ar" ? "ar-EG-u-nu-latn" : "en-US";
}

export function formatMoney(amount: number, currency: string, lang: Lang): string {
  const cur = currency.toUpperCase();
  const digits = cur === "PI" ? (amount % 1 === 0 ? 0 : amount < 10 ? 4 : 2) : amount % 1 === 0 ? 0 : 2;
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  if (cur === "PI") return lang === "ar" ? `${num} باي` : `${num} π`;
  if (cur === "USD") return `$${num}`;
  if (cur === "EGP") return lang === "ar" ? `${num} ج.م` : `EGP ${num}`;
  try {
    return new Intl.NumberFormat(numLocale(lang), { style: "currency", currency: cur, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${num} ${cur}`;
  }
}

export function countryLabel(code: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** ISO alpha-2 → flag emoji. */
export function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
