import "server-only";
import { parseQuery } from "./shop";
import type { Scope, WireMessage } from "../types";

/**
 * "Index first" for Ask Dalil: a plain product request at the start of a chat ("سماعة بلوتوث
 * تحت 50 باي", "iphone 15") is answered from Dalil Index directly — the AI only writes the short
 * recommendation. Anything else (photos, links, barcodes, local/services, follow-ups) goes to the
 * full agent. Returns the product words + budget, or null.
 */

// Request words that aren't the product ("عايز", "find me", "please" …).
const FILLER = new Set(
  (
    "i want need looking for find search show me get buy a an the please some any good best nice price of for with pi π " +
    "عايز عاوز عايزه عاوزه ابغى ابغي ابي اريد أريد محتاج محتاجه دورلي دور ابحث ابحثلي هات هاتلي جيبلي شوفلي لو سمحت من فضلك ممكن " +
    "عن على علي لي ليا في فى اي أي حاجه حاجة كويس كويسه كويسة حلو حلوه حلوة سعر اسعار أسعار بكام شراء اشتري اشترى باي بالباي ب"
  ).split(/\s+/),
);

// Requests the full agent handles better (local shops, services, comparisons, questions about stores).
const NOT_PRODUCT =
  /near me|nearby|in store|shop in|delivery|restaurant|food|doctor|plumber|telegram|stars|premium|top.?up|recharge|compare|\bvs\b|difference|review|is .+ (good|legit|safe)|scam|قريب|جنبي|حوالي|محل|محلات|مطعم|اكل|أكل|توصيل|دليفري|دكتور|سباك|تليجرام|تيليجرام|شحن رصيد|كارت شحن|قارن|مقارنه|مقارنة|الفرق|افضل من|أفضل من|نصاب|امان|أمان|موثوق|\?|؟/i;

export interface QuickQuery {
  text: string;
  min?: number;
  max?: number;
}

export function quickQuery(history: WireMessage[], scope: Scope): QuickQuery | null {
  if (scope === "local" || scope === "services") return null;
  // Only the first message of a chat: follow-ups ("ارخص", "the second one") need the conversation.
  if (history.length !== 1 || history[0].role !== "user" || history[0].images?.length) return null;
  const raw = history[0].text.trim();
  if (!raw || raw.length > 120 || /https?:\/\/|www\.|\b\d{8,14}\b/i.test(raw) || NOT_PRODUCT.test(raw)) return null;
  const p = parseQuery(raw);
  const words = p.text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+.\- ]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
  if (!words.length || words.length > 6) return null;
  return { text: words.join(" "), min: p.min, max: p.max };
}
