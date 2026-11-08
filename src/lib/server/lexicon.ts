import "server-only";

/**
 * Small Arabic ↔ English shopping lexicon. Store catalogs (e.g. Salla Shop) are
 * mixed-language, so a search in one language misses products named in the
 * other. expandQuery("سماعة لاسلكية") → ["سماعة لاسلكية", "wireless headphones"].
 */
const PAIRS: [string[], string][] = [
  [["سماعة", "سماعات", "هيدفون"], "headphones"],
  [["سماعة اذن", "ايربودز", "سماعات اذن"], "earbuds"],
  [["لاسلكي", "لاسلكية", "بلوتوث"], "wireless"],
  [["موبايل", "تليفون", "هاتف", "جوال"], "phone"],
  [["لابتوب", "لاب توب", "حاسوب محمول"], "laptop"],
  [["تابلت", "لوحي"], "tablet"],
  [["ساعة ذكية", "ساعه ذكيه"], "smart watch"],
  [["ساعة", "ساعه"], "watch"],
  [["شاحن"], "charger"],
  [["كابل", "وصلة"], "cable"],
  [["باور بانك", "شاحن متنقل"], "power bank"],
  [["جراب", "كفر"], "phone case"],
  [["شاشة", "شاشه", "تلفزيون", "تليفزيون"], "tv"],
  [["كاميرا"], "camera"],
  [["ماوس"], "mouse"],
  [["كيبورد", "لوحة مفاتيح"], "keyboard"],
  [["سماعة جيمنج", "جيمنج"], "gaming"],
  [["بلايستيشن"], "playstation"],
  [["عطر", "برفان", "برفيوم"], "perfume"],
  [["ساعة يد"], "wristwatch"],
  [["شنطة", "شنطه", "حقيبة"], "bag"],
  [["حذاء", "جزمة", "كوتشي"], "shoes"],
  [["تيشيرت", "تي شيرت"], "t-shirt"],
  [["قميص"], "shirt"],
  [["فستان"], "dress"],
  [["بنطلون"], "pants"],
  [["جاكيت", "جاكت"], "jacket"],
  [["نظارة", "نضارة"], "glasses"],
  [["قهوة", "قهوه"], "coffee"],
  [["شاي"], "tea"],
  [["عسل"], "honey"],
  [["زيت زيتون"], "olive oil"],
  [["تمر", "تمور"], "dates"],
  [["مكياج", "ميكب"], "makeup"],
  [["كريم"], "cream"],
  [["شامبو"], "shampoo"],
  [["خلاط"], "blender"],
  [["مكواة", "مكوه"], "iron"],
  [["غسالة"], "washing machine"],
  [["ثلاجة", "تلاجة"], "fridge"],
  [["مروحة"], "fan"],
  [["تكييف", "مكيف"], "air conditioner"],
  [["كرسي"], "chair"],
  [["مكتب"], "desk"],
  [["كتاب", "كتب"], "book"],
  [["لعبة", "لعب", "العاب"], "toy"],
  [["عربية", "سيارة"], "car"],
  [["عجلة", "دراجة"], "bicycle"],
  [["صيانة"], "repair"],
  [["شحن رصيد", "كارت شحن"], "top up"],
  [["نجوم تيليجرام", "نجوم تليجرام"], "telegram stars"],
  [["توصيل"], "delivery"],
  [["مطعم", "اكل", "أكل"], "food"],
  [["رخيص", "ارخص", "أرخص"], "cheap"],
  [["اصلي", "أصلي"], "original"],
  [["جديد"], "new"],
  [["مستعمل"], "used"],
  [["رجالي"], "men"],
  [["حريمي", "نسائي"], "women"],
  [["اطفال", "أطفال"], "kids"],
  [["اسود", "أسود"], "black"],
  [["ابيض", "أبيض"], "white"],
];

const AR = /[؀-ۿ]/;
const strip = (s: string) => s.replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

/** Translate a short product query word-group by word-group (longest phrase first). */
export function translateQuery(q: string): string | null {
  const text = strip(q.trim());
  if (!text) return null;
  const ar = AR.test(text);
  const phrases = PAIRS.flatMap(([arList, en]) => (ar ? arList.map((a) => [strip(a), en] as const) : [[en, arList[0]] as const])).sort((a, b) => b[0].length - a[0].length);
  let rest = ` ${text} `;
  const out: string[] = [];
  for (const [from, to] of phrases) {
    const at = rest.indexOf(` ${from} `);
    if (at >= 0) {
      out.push(to);
      rest = rest.replace(` ${from} `, " ");
    }
  }
  // keep brand/model tokens (latin letters or digits) as they are
  const keep = rest.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w) && !AR.test(w) && ar);
  const res = [...keep, ...out].join(" ").trim();
  return out.length && res && res !== text ? res : null;
}

/** The query plus its translation (if any), max 2. */
export function expandQuery(q: string): string[] {
  const t = translateQuery(q);
  return t ? [q, t] : [q];
}
