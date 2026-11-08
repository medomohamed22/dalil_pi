import "server-only";

/**
 * Smart indexing with plain rules (no AI): a product's category and its "twin key"
 * (brand + model → the same product in other stores) from its own title and store category.
 * Runs in memory when the index loads — no model call, no database write.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** First match wins, so specific groups come before broad ones (headphones before phones). */
const CATEGORY_WORDS: Array<[string, string[]]> = [
  ["headphones", ["headphone", "headphones", "headset", "earbuds", "earbud", "earphones", "earphone", "airpods", "buds", "سماعه", "سماعات", "هيدفون", "ايربودز", "هيدسيت"]],
  ["topup", ["top up", "topup", "recharge", "شحن رصيد", "كارت شحن", "رصيد"]],
  ["gift_cards", ["gift card", "giftcard", "itunes", "google play", "steam card", "psn card", "كارت هدايا", "بطاقه هدايا"]],
  ["phones", ["smartphone", "iphone", "galaxy", "redmi", "mobile phone", "موبايل", "تليفون", "هاتف", "جوال", "ايفون", "phone"]],
  ["computers", ["laptop", "notebook", "macbook", "computer", "desktop", "tablet", "ipad", "monitor", "keyboard", "mouse", "لابتوب", "لاب توب", "كمبيوتر", "تابلت", "شاشه كمبيوتر", "كيبورد", "ماوس"]],
  ["tv_audio", ["television", "smart tv", "projector", "soundbar", "speaker", "receiver", "تلفزيون", "تليفزيون", "بروجيكتور", "سبيكر", "مكبر صوت"]],
  ["appliances", ["washing machine", "washer", "fridge", "refrigerator", "freezer", "microwave", "oven", "blender", "mixer", "vacuum", "kettle", "air fryer", "iron", "heater", "fan", "غساله", "ثلاجه", "ديب فريزر", "ميكروويف", "فرن", "خلاط", "مكنسه", "غلايه", "قلايه", "مكواه", "دفايه", "مروحه", "تكييف"]],
  ["perfume", ["perfume", "fragrance", "cologne", "eau de", "عطر", "برفان", "بارفان", "بيرفيوم"]],
  ["beauty", ["cream", "serum", "shampoo", "conditioner", "makeup", "lipstick", "mascara", "skin care", "skincare", "lotion", "كريم", "سيروم", "شامبو", "مكياج", "روج", "ماسكارا", "بشره", "لوشن", "عنايه"]],
  ["grocery", ["tea", "coffee", "honey", "rice", "oil", "sugar", "pasta", "chocolate", "jam", "dates", "spices", "شاي", "قهوه", "عسل", "رز", "ارز", "زيت", "سكر", "مكرونه", "شوكولاته", "مربي", "تمر", "توابل", "بهارات"]],
  ["shoes", ["shoes", "shoe", "sneakers", "sneaker", "boots", "sandals", "slippers", "حذاء", "جزمه", "كوتشي", "شوز", "صندل", "شبشب", "بوت"]],
  ["fashion", ["shirt", "t shirt", "tshirt", "dress", "jacket", "jeans", "hoodie", "abaya", "pants", "bag", "handbag", "wallet", "watch", "ملابس", "تيشيرت", "تيشرت", "قميص", "فستان", "جاكيت", "بنطلون", "عبايه", "شنطه", "حقيبه", "ترنج", "محفظه", "ساعه"]],
  ["kids", ["kids", "baby", "toy", "toys", "diaper", "اطفال", "طفل", "اطفالي", "لعبه", "العاب", "بيبي", "حفاضات"]],
  ["vehicles", ["car", "motorcycle", "scooter", "سياره", "عربيه", "موتوسيكل", "موتوسيكلات", "اسكوتر", "toyota", "hyundai", "suzuki", "porsche", "kia", "bmw", "mercedes", "nissan", "chevrolet", "بي ام دبليو", "مرسيدس", "هيونداي", "تويوتا", "كيا", "بورش", "سوزوكي", "نيسان", "شيفروليه"]],
  ["sports", ["sport", "sports", "fitness", "gym", "bicycle", "bike", "dumbbell", "football", "رياضه", "رياضي", "دراجه", "عجله", "دمبل", "كوره"]],
  ["real_estate", ["apartment", "villa", "duplex", "land for sale", "building", "شقه", "فيلا", "دوبلكس", "ارض للبيع", "عقار", "عماره"]],
  ["collectibles", ["banknote", "coin", "coins", "stamp", "trading card", "pokemon", "عمله", "عملات", "طوابع", "كروت ديجيمون"]],
  ["services", ["service", "design", "repair", "development", "website", "logo", "course", "خدمه", "تصميم", "صيانه", "برمجه", "كورس"]],
  ["home", ["curtain", "kitchen", "cookware", "furniture", "sofa", "bed", "carpet", "pillow", "towel", "cleaning", "detergent", "ستائر", "ستاره", "مطبخ", "حلل", "اثاث", "كنبه", "سرير", "سجاد", "مخده", "فوطه", "منظفات", "تنظيف", "مفروشات"]],
];

/** Store category text → our category (Salla, Global Trade Pi). */
const STORE_CATEGORY: Array<[RegExp, string]> = [
  [/سوبر ?ماركت|supermarket|food/i, "grocery"],
  [/عطور|perfume/i, "perfume"],
  [/احذيه|أحذية|الاحذيه|shoes/i, "shoes"],
  [/ملابس|clothing|fashion/i, "fashion"],
  [/اطفال|أطفال|kids/i, "kids"],
  [/رياضيه|رياضية|sport/i, "sports"],
  [/مركبات|vehicle/i, "vehicles"],
  [/الشحن|top ?up/i, "topup"],
  [/اجهزه منزليه|أجهزة منزلية|appliance/i, "appliances"],
  [/ادوات منزليه|أدوات منزلية|منظفات|household|home/i, "home"],
  [/موبايلات|mobiles|phones/i, "phones"],
  [/الكترونيات|إلكترونيات|electronic/i, "tv_audio"],
  [/عنايه|العناية|beauty|care/i, "beauty"],
  [/عملات|collect/i, "collectibles"],
  [/books|media/i, "services"],
];

const CAT_INDEX = CATEGORY_WORDS.map(([cat, list]) => [cat, list.map(norm)] as const);

export function ruleCategory(it: { title: string; title_ar?: string | null; category?: string | null; tags?: string[] | null }): string | null {
  const text = ` ${norm(`${it.title} ${it.title_ar ?? ""} ${(it.tags ?? []).join(" ")}`)} `;
  const words = new Set(text.trim().split(" "));
  for (const [cat, list] of CAT_INDEX) {
    for (const k of list) {
      // Whole words; a short ending is allowed (plurals: "earbud" → "earbuds"), not "recharge" → "rechargeable".
      if (k.includes(" ") ? text.includes(` ${k} `) : words.has(k) || (k.length >= 4 && [...words].some((w) => w.startsWith(k) && w.length - k.length <= 2))) return cat;
    }
  }
  const sc = it.category ?? "";
  for (const [re, cat] of STORE_CATEGORY) if (re.test(sc)) return cat;
  return null;
}

/* ---------- brand + model → twin key ---------- */

const BRANDS = [
  "apple", "samsung", "xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme", "vivo", "oneplus", "infinix", "tecno", "itel", "nokia", "motorola", "google",
  "oraimo", "anker", "soundcore", "jbl", "sony", "bose", "beats", "sennheiser", "skullcandy", "edifier", "marshall", "baseus", "ugreen", "joyroom", "qcy", "haylou", "lenovo",
  "hp", "dell", "asus", "acer", "msi", "lg", "toshiba", "sharp", "philips", "panasonic", "tcl", "hisense", "canon", "nikon", "gopro", "dji", "nintendo", "xbox", "playstation",
  "logitech", "tplink", "amazfit", "garmin", "fitbit", "casio", "braun", "tefal", "moulinex", "kenwood", "black decker", "nike", "adidas", "puma", "omega", "rolex",
  "toyota", "hyundai", "kia", "suzuki", "nissan", "porsche", "bmw", "mercedes", "chevrolet",
];
/** Arabic spellings of brands people type. */
const BRAND_AR: Record<string, string> = {
  ابل: "apple", ايفون: "apple", سامسونج: "samsung", سامسونغ: "samsung", شاومي: "xiaomi", ريدمي: "redmi", بوكو: "poco", هواوي: "huawei", هونر: "honor", اوبو: "oppo", ريلمي: "realme",
  فيفو: "vivo", انفنكس: "infinix", انفينكس: "infinix", تكنو: "tecno", نوكيا: "nokia", اوريمو: "oraimo", انكر: "anker", ساوندكور: "soundcore", سوني: "sony", لينوفو: "lenovo",
  توشيبا: "toshiba", شارب: "sharp", فيليبس: "philips", كانون: "canon", نيكون: "nikon", كاسيو: "casio", براون: "braun", تيفال: "tefal", مولينكس: "moulinex", كينوود: "kenwood",
  نايك: "nike", اديداس: "adidas", بوما: "puma", تويوتا: "toyota", هيونداي: "hyundai", كيا: "kia", سوزوكي: "suzuki", سوزوكى: "suzuki", نيسان: "nissan", بورش: "porsche",
};
const BRAND_SET = new Set(BRANDS.map((b) => b.replace(/\s+/g, "")));
const UNIT = /^(\d+(\.\d+)?)(gb|tb|mb|mbps|gbps|mah|ml|l|w|watt|watts|mm|cm|m|kg|g|inch|in|pcs|pc|hz|khz|v|k|x|p)$/;
const SKIP_WORD = new Set(["pack", "size", "set", "pcs", "piece", "pieces", "for", "with", "and", "the", "new", "original", "مقاس", "عدد", "قطعه", "قطع", "جرام", "مل", "لتر"]);
const QUALIFIER = new Set(["pro", "max", "plus", "ultra", "lite", "mini", "neo", "se", "air", "fe", "prime"]);

/** "oraimo SpaceBuds 2 AI earbuds" → "oraimo|spacebuds2"; "iPhone 14 Pro 128GB" → "apple|iphone14pro". */
export function ruleTwinKey(it: { title: string; title_ar?: string | null }): string | null {
  const raw = `${it.title} ${it.title_ar ?? ""}`.toLowerCase().replace(/[-_/]/g, " ");
  const toks = raw.split(/[^\p{L}\p{N}.]+/u).map((x) => x.replace(/\.$/, "")).filter(Boolean);
  let brand: string | null = null;
  let at = -1;
  for (let i = 0; i < toks.length && !brand; i++) {
    const t = toks[i];
    const two = i + 1 < toks.length ? t + toks[i + 1] : "";
    if (BRAND_SET.has(t)) [brand, at] = [t, i];
    else if (two && BRAND_SET.has(two)) [brand, at] = [two, i + 1];
    else if (BRAND_AR[norm(t)]) [brand, at] = [BRAND_AR[norm(t)], i];
  }
  if (!brand) return null;
  if (brand === "redmi" || brand === "poco") brand = "xiaomi";
  if (brand === "soundcore") brand = "anker";
  // The model: the first letters+digits token (q20i, s24, a55), or a word followed by a number
  // (spacebuds 2, iphone 14), plus a qualifier right after (pro, max…). Units (128gb, 5000mah) never count.
  const rest = toks.slice(at + 1).filter((t) => !SKIP_WORD.has(t));
  const scan = rest.length ? rest : toks;
  for (let i = 0; i < scan.length; i++) {
    const t = scan[i];
    if (UNIT.test(t) || /^\d{5,}$/.test(t)) continue;
    let model: string | null = null;
    let next = i + 1;
    if (/[a-z]/.test(t) && /\d/.test(t) && t.length >= 2) model = t;
    else if (/^\d{1,4}$/.test(t) && i > 0 && /^[a-z]{2,}$/.test(scan[i - 1]) && !QUALIFIER.has(scan[i - 1])) model = scan[i - 1] + t;
    else if (/^[a-z]{3,}$/.test(t) && /^\d{1,4}$/.test(scan[i + 1] ?? "") && !UNIT.test(scan[i + 1] ?? "")) {
      model = t + scan[i + 1];
      next = i + 2;
    }
    if (!model) continue;
    if (QUALIFIER.has(scan[next] ?? "")) model += scan[next];
    if (model.replace(/\d/g, "").length === 0 && model.length < 3) continue;
    return `${brand}|${model.replace(/[^\p{L}\p{N}]/gu, "")}`;
  }
  return null;
}
