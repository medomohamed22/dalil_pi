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
    account: "My account",
    plan: "Plan",
    plans: { free: "Free", basic: "Basic", plus: "Plus", pro: "Pro" } as Record<string, string>,
    planEnds: (d: string) => `Renews ${d}`,
    searchesUsed: "Searches",
    ordersUsed: "Orders",
    addresses: "Addresses",
    addAddress: "Add address",
    editAddress: "Edit address",
    noAddresses: "No saved addresses yet.",
    fullName: "Full name",
    phone: "Phone",
    city: "City",
    area: "Area / district",
    street: "Street",
    building: "Building, floor, apartment",
    postalCode: "Postal code",
    notes: "Delivery notes",
    label: "Label (Home, Work…)",
    makeDefault: "Use as default",
    defaultTag: "Default",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    orders: "Orders",
    noOrders: "No orders yet.",
    order: "Order",
    orderTitle: "Order with Dalil Pi",
    shipTo: "Ship to",
    createOrder: "Save order & go to store",
    orderSaved: "Order saved. Pay the store with Pi and paste these details at checkout:",
    copyDetails: "Copy shipping details",
    openStore: "Open the store to pay",
    markPaid: "I paid",
    markDelivered: "Delivered",
    cancelOrder: "Cancel",
    status: { draft: "Started", placed: "Placed", awaiting_payment: "Awaiting payment", paid: "Paid", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", failed: "Failed" } as Record<string, string>,
    payDirect: "You pay the store directly from your Pi wallet — Dalil Pi never holds your Pi.",
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
    account: "حسابي",
    plan: "الباقة",
    plans: { free: "مجانية", basic: "أساسية", plus: "بلس", pro: "برو" } as Record<string, string>,
    planEnds: (d: string) => `بتتجدد ${d}`,
    searchesUsed: "عمليات البحث",
    ordersUsed: "الطلبات",
    addresses: "العناوين",
    addAddress: "ضيف عنوان",
    editAddress: "تعديل العنوان",
    noAddresses: "مفيش عناوين محفوظة لسه.",
    fullName: "الاسم بالكامل",
    phone: "رقم التليفون",
    city: "المدينة",
    area: "المنطقة / الحي",
    street: "الشارع",
    building: "العمارة، الدور، الشقة",
    postalCode: "الرمز البريدي",
    notes: "ملاحظات للتوصيل",
    label: "اسم العنوان (البيت، الشغل…)",
    makeDefault: "خليه العنوان الأساسي",
    defaultTag: "الأساسي",
    save: "حفظ",
    cancel: "إلغاء",
    delete: "حذف",
    orders: "الطلبات",
    noOrders: "مفيش طلبات لسه.",
    order: "اطلب",
    orderTitle: "اطلب مع دليل باي",
    shipTo: "الشحن على",
    createOrder: "احفظ الطلب وروح للمتجر",
    orderSaved: "الطلب اتحفظ. ادفع للمتجر بالباي وحط البيانات دي في صفحة الدفع:",
    copyDetails: "انسخ بيانات الشحن",
    openStore: "افتح المتجر وادفع",
    markPaid: "دفعت",
    markDelivered: "وصل",
    cancelOrder: "إلغاء",
    status: { draft: "بدأ", placed: "اتطلب", awaiting_payment: "مستني الدفع", paid: "اتدفع", shipped: "اتشحن", delivered: "وصل", cancelled: "اتلغى", failed: "فشل" } as Record<string, string>,
    payDirect: "إنت بتدفع للمتجر مباشرة من محفظة باي — دليل باي عمره ما بيمسك الباي بتاعك.",
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
