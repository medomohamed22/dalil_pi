import "server-only";
import { storeSignals } from "./community";
import { assertPublicUrl, fetchWithTimeout, readLimited } from "./net";
import { domainAgeYears } from "./trust";
import { detectWooPi } from "./woo";
import type { StoreCheck } from "../types";

/**
 * "Is this store safe?" — checks any shop link (or name) without a product search:
 * official Pi marketplace, HTTPS, domain age (RDAP), a Pi checkout, wallet
 * passphrase phishing on the page, and Dalil Pi buyer reviews / complaints.
 */
const OFFICIAL = ["mall.salla-shop.com", "salla-shop.com", "piketplace.com", "mapofpi.com", "pinet.com", "minepi.com"];
// Pages that ask for the 24-word wallet passphrase are always scams.
const PHISH = /(pass\s?phrase|seed\s?phrase|recovery\s?phrase|24[\s-]?words?|mnemonic|عبارة\s?المرور|الكلمات\s?(السرية|الـ?24)|24\s?كلمة|كلمات\s?المحفظة)/i;
const allowPrivate = () => !process.env.VERCEL && process.env.DALIL_TEST_ALLOW_PRIVATE_STORES === "1";

export async function checkStore(input: string): Promise<StoreCheck> {
  let raw = input.trim().slice(0, 300);
  if (!/^https?:\/\//i.test(raw) && /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) raw = `https://${raw}`;
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  const name = url ? url.hostname.replace(/^www\./, "") : raw;
  const domain = url?.hostname.replace(/^www\./, "").toLowerCase();
  const reasons: StoreCheck["reasons"] = [];
  let score = 50;

  const [age, signals, page, woo] = await Promise.all([
    domain ? domainAgeYears(domain).catch(() => null) : Promise.resolve(null),
    storeSignals([{ domain, name }]).catch(() => new Map()),
    url
      ? (async () => {
          try {
            if (!allowPrivate()) await assertPublicUrl(url!.href);
            const r = await fetchWithTimeout(url!.href, { timeoutMs: 7000, headers: { "User-Agent": "Mozilla/5.0 DalilPi/1.0", Accept: "text/html" } });
            return { ok: r.ok, html: (await readLimited(r, 800_000)).slice(0, 800_000) };
          } catch {
            return { ok: false, html: "" };
          }
        })()
      : Promise.resolve(null),
    url ? detectWooPi(url.href).catch(() => null) : Promise.resolve(null),
  ]);

  const official = !!domain && OFFICIAL.some((d) => domain === d || domain.endsWith("." + d));
  if (official) {
    score += 30;
    reasons.push({ ok: true, key: "official" });
  }
  if (url) {
    if (url.protocol === "https:") reasons.push({ ok: true, key: "https" });
    else {
      score -= 15;
      reasons.push({ ok: false, key: "no_https" });
    }
  }
  if (age != null) {
    if (age >= 2) {
      score += 10;
      reasons.push({ ok: true, key: "old_domain", value: Math.floor(age) });
    } else if (age < 0.5) {
      score -= 20;
      reasons.push({ ok: false, key: "new_domain" });
    }
  }
  if (woo) {
    score += 10;
    reasons.push({ ok: true, key: "pi_checkout" });
  }
  const text = page?.html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ") ?? "";
  const asksPassphrase = PHISH.test(text) && /<input|<textarea/i.test(page?.html ?? "");
  if (asksPassphrase) {
    score = 0;
    reasons.unshift({ ok: false, key: "passphrase" });
  }
  if (url && page && !page.ok) reasons.push({ ok: false, key: "unreachable" });
  const sig = signals.get(domain ?? name.toLowerCase());
  if (sig?.reviews) {
    score += sig.avg && sig.avg >= 4 ? 10 : sig.avg && sig.avg < 3 ? -10 : 0;
    reasons.push({ ok: (sig.avg ?? 0) >= 3, key: "dalil_reviews", value: sig.reviews, avg: sig.avg ?? undefined });
  }
  if (sig?.disputes) {
    score -= Math.min(40, sig.disputes * 10);
    reasons.push({ ok: false, key: "complaints", value: sig.disputes });
  }
  if (!url) reasons.push({ ok: false, key: "no_link" });
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: StoreCheck["verdict"] = asksPassphrase ? "scam" : score >= 70 ? "safe" : score >= 40 ? "caution" : "risky";
  return { name, url: url?.href, score, verdict, reasons };
}
