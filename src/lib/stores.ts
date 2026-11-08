/**
 * Pi stores Dalil Pi knows (shared by the server and the UI). `source` = searchable in Dalil Index.
 * `partner` is only set once a store has signed up with Dalil Pi (none yet — the API kits are ready).
 * `countries`: shown only to users in these countries (stores that only serve them).
 */
export type StoreKind = "marketplace" | "local" | "services";

export interface StoreEntry {
  id: string;
  name: string;
  url: string;
  kind: StoreKind;
  /** Brand colours for the monogram logo (no third-party logos are hot-linked). */
  color: string;
  mono: string;
  source?: "pcm" | "salla" | "gtp";
  partner?: boolean;
  regions: { en: string; ar: string };
  about: { en: string; ar: string };
  countries?: string[];
  /** Opens the "near me" view instead of a store page. */
  nearMe?: boolean;
}

export const STORE_DIRECTORY: StoreEntry[] = [
  {
    id: "pcm",
    name: "Pi Chain Mall",
    url: "https://pipcm.com",
    kind: "marketplace",
    color: "#5B2A86",
    mono: "π",
    source: "pcm",
    regions: { en: "Worldwide · global sale", ar: "كل الدول · بيع دولي" },
    about: { en: "Pi Network's global marketplace — Pi Hackathon winner.", ar: "سوق باي العالمي — فايز في هاكاثون باي." },
  },
  {
    id: "salla",
    name: "Salla Shop Mall",
    url: "https://mall.salla-shop.com",
    kind: "marketplace",
    color: "#0E7C66",
    mono: "S",
    source: "salla",
    regions: { en: "Egypt · Middle East · Africa", ar: "مصر · الشرق الأوسط · أفريقيا" },
    about: { en: "Multi-vendor Pi mall with Pi SDK checkout and buyer protection.", ar: "مول متعدد البائعين بدفع باي وحماية للمشتري." },
  },
  {
    id: "gtp",
    name: "Global Trade Pi",
    url: "https://globaltradepi.xyz",
    kind: "marketplace",
    color: "#1D4E89",
    mono: "G",
    source: "gtp",
    regions: { en: "Sellers worldwide", ar: "بائعين من كل الدول" },
    about: { en: "Small global Pi marketplace — goods and digital items.", ar: "سوق باي عالمي صغير — منتجات وحاجات رقمية." },
  },
  {
    id: "piketplace",
    name: "Piketplace",
    url: "https://piketplace.com",
    kind: "marketplace",
    color: "#E4572E",
    mono: "P",
    regions: { en: "Worldwide", ar: "كل الدول" },
    about: { en: "Peer-to-peer Pi marketplace. Search it with Ask Dalil.", ar: "سوق باي بين الأفراد. دوّر فيه من «اسأل دليل»." },
  },
  {
    id: "salla-local",
    name: "Salla Local",
    url: "https://mall.salla-shop.com/local",
    kind: "local",
    color: "#0E7C66",
    mono: "SL",
    nearMe: true,
    countries: ["EG"],
    regions: { en: "Egypt · pay in shops", ar: "مصر · ادفع في المحلات" },
    about: { en: "Physical shops that take Pi at the counter.", ar: "محلات بتقبل الدفع بالباي في المحل." },
  },
  {
    id: "mapofpi",
    name: "Map of Pi",
    url: "https://mapofpi.com",
    kind: "local",
    color: "#2E7D32",
    mono: "M",
    nearMe: true,
    regions: { en: "Local shops worldwide", ar: "محلات في كل الدول" },
    about: { en: "Map of shops that accept Pi.", ar: "خريطة المحلات اللي بتقبل باي." },
  },
  {
    id: "servara",
    name: "Servara",
    url: "https://servara.app",
    kind: "services",
    color: "#7B3FE4",
    mono: "S",
    countries: ["PH", "JP", "IN", "US"],
    regions: { en: "Philippines · Japan · India · USA", ar: "الفلبين · اليابان · الهند · أمريكا" },
    about: { en: "Local and remote services paid in Pi.", ar: "خدمات محلية وأونلاين بالباي." },
  },
  {
    id: "hupi",
    name: "Hũ Pi",
    url: "https://hupi.vn",
    kind: "marketplace",
    color: "#C62828",
    mono: "H",
    countries: ["VN"],
    regions: { en: "Vietnam · Pi cashback", ar: "فيتنام · استرداد باي" },
    about: { en: "Buy on Shopee/TikTok Shop/Lazada and get Pi cashback.", ar: "اشتري من شوبي وتيك توك شوب ولازادا واسترد باي." },
  },
  {
    id: "314159u",
    name: "314159U",
    url: "https://314159u.com",
    kind: "marketplace",
    color: "#AD1457",
    mono: "U",
    countries: ["CN"],
    regions: { en: "China", ar: "الصين" },
    about: { en: "Chinese Pi marketplace.", ar: "سوق باي صيني." },
  },
];

export const visibleStores = (country: string) => STORE_DIRECTORY.filter((s) => !s.countries || s.countries.includes(country));
