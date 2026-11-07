import "server-only";

/**
 * The visitor's country from the IP, as resolved by Vercel's edge network
 * (`x-vercel-ip-country`, ISO 3166-1 alpha-2). We keep only the country and
 * city — never the IP itself. Falls back to the browser language region.
 */
export interface Geo {
  country: string;
  city?: string;
  /** Where the country came from. */
  source: "ip" | "language" | "default";
}

export function isCountryCode(c: unknown): c is string {
  return typeof c === "string" && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1";
}

export function geoFromRequest(req: Request): Geo {
  const h = req.headers;
  const ipCountry = (h.get("x-vercel-ip-country") ?? "").toUpperCase();
  let city: string | undefined;
  try {
    const c = h.get("x-vercel-ip-city");
    city = c ? decodeURIComponent(c).slice(0, 80) : undefined;
  } catch {
    city = undefined;
  }
  if (isCountryCode(ipCountry)) return { country: ipCountry, city, source: "ip" };
  // e.g. "ar-EG,ar;q=0.9,en;q=0.8" → EG
  const m = (h.get("accept-language") ?? "").match(/[a-z]{2,3}-([A-Z]{2})/);
  if (m && isCountryCode(m[1])) return { country: m[1], city, source: "language" };
  return { country: "US", city, source: "default" };
}

/** Main currency per country (for the "≈ local price" hint and the agent prompt). */
const CURRENCY: Record<string, string> = {
  EG: "EGP", US: "USD", SA: "SAR", AE: "AED", KW: "KWD", QA: "QAR", BH: "BHD", OM: "OMR", JO: "JOD",
  MA: "MAD", DZ: "DZD", TN: "TND", LY: "LYD", IQ: "IQD", LB: "LBP", SD: "SDG", YE: "YER", SY: "SYP", PS: "ILS",
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", CM: "XAF", CI: "XOF", SN: "XOF", UG: "UGX", TZ: "TZS", ET: "ETB",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", PH: "PHP", VN: "VND", ID: "IDR", MY: "MYR", TH: "THB",
  SG: "SGD", CN: "CNY", HK: "HKD", TW: "TWD", KR: "KRW", JP: "JPY", TR: "TRY", IR: "IRR", RU: "RUB", UA: "UAH",
  GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", BR: "BRL", MX: "MXN", AR: "ARS", CO: "COP", CL: "CLP", PE: "PEN",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", PT: "EUR", IE: "EUR", AT: "EUR", GR: "EUR",
  FI: "EUR", SK: "EUR", SI: "EUR", LT: "EUR", LV: "EUR", EE: "EUR", CY: "EUR", MT: "EUR", LU: "EUR", HR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
};

export function currencyOf(country: string): string {
  return CURRENCY[country] ?? "USD";
}

export function countryName(code: string, lang: "en" | "ar" = "en"): string {
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
