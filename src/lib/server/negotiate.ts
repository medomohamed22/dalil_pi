import "server-only";
import { fetchWithTimeout } from "./net";
import { PROTOCOL, sellerTurn, type Item, type SellerMsg } from "./seller";
import { prepareOffer } from "./sign";
import type { Lang, NegotiationEvent, Offer } from "../types";

/**
 * Dalil's BUYER agent: negotiates with the store's seller agent over HTTP
 * (dalil-negotiation/1) and returns a newly signed offer at the agreed price.
 * Strategy: anchor ~10% under list, cite a cheaper competitor if there is one,
 * ask for free shipping, concede a shrinking share of the gap, max 3 bids.
 */
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      res();
    });
  });

const r2 = (v: number, cur: string) => (cur === "EGP" ? Math.round(v / 5) * 5 : Math.round(v * 100) / 100);
const money = (v: number, cur: string, ar: boolean) =>
  cur === "USD" ? `$${v.toLocaleString("en-US")}` : `${v.toLocaleString("en-US")} ${cur === "EGP" ? (ar ? "ج.م" : "EGP") : cur}`;

export async function* negotiate(opts: {
  offer: Offer;
  lang: Lang;
  origin: string;
  competitor?: { store: string; total: number };
  signal?: AbortSignal;
}): AsyncGenerator<NegotiationEvent> {
  const { offer, lang, signal } = opts;
  const ar = lang === "ar";
  const cur = offer.currency;
  const item: Item = { title: offer.title, store: offer.store, price: offer.price, shipping: offer.shipping ?? 0, currency: cur };
  let session: string | undefined;
  let transport: "http" | "local" = "http";

  const ask = async (message: { type: "hello" | "bid" | "accept"; price?: number; ask?: string[] }): Promise<SellerMsg> => {
    const body = { protocol: PROTOCOL, session, item, message };
    if (transport === "http") {
      try {
        const r = await fetchWithTimeout(`${opts.origin}/api/seller-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          timeoutMs: 8000,
          signal,
        });
        if (!r.ok) throw new Error(`seller ${r.status}`);
        const j = (await r.json()) as { session: string; message: SellerMsg };
        session = j.session;
        return j.message;
      } catch {
        transport = "local"; // e.g. deployment protection on previews — same agent, in-process
      }
    }
    const j = sellerTurn({ session, item, message });
    session = j.session;
    return j.message;
  };
  const seller = (m: SellerMsg): NegotiationEvent => ({
    type: "msg",
    from: "seller",
    text: ar ? m.text_ar : m.text_en,
    price: m.price,
    shipping: m.shipping,
  });
  const dalil = (text: string, price?: number): NegotiationEvent => ({ type: "msg", from: "dalil", text, price });

  yield { type: "typing", from: "seller" };
  const hello = await ask({ type: "hello" });
  await wait(500, signal);
  yield seller(hello);

  const comp = opts.competitor && opts.competitor.total < offer.total ? opts.competitor : undefined;
  let bid = r2(offer.price * 0.9, cur);
  let last = hello;
  for (let round = 1; round <= 3; round++) {
    if (signal?.aborted) return;
    yield { type: "typing", from: "dalil" };
    await wait(700, signal);
    const text =
      round === 1
        ? ar
          ? `أهلًا، أنا دليل — وكيل شراء بالنيابة عن عميل جاهز يدفع فورًا بـ PayPal.${comp ? ` نفس المنتج عند ${comp.store} بـ ${money(comp.total, cur, ar)}.` : ""} أقدر أدفع ${money(bid, cur, ar)}${item.shipping ? " مع شحن مجاني" : ""}.`
          : `Hi, I'm Dalil — a buying agent for a customer ready to pay now with PayPal.${comp ? ` The same item is ${money(comp.total, cur, ar)} at ${comp.store}.` : ""} I can pay ${money(bid, cur, ar)}${item.shipping ? " with free shipping" : ""}.`
        : ar
          ? `خلينا نتقابل في النص: ${money(bid, cur, ar)}.`
          : `Let's meet in the middle: ${money(bid, cur, ar)}.`;
    yield dalil(text, bid);
    yield { type: "typing", from: "seller" };
    last = await ask({ type: "bid", price: bid, ask: item.shipping ? ["free_shipping"] : [] });
    await wait(650, signal);
    yield seller(last);
    if (last.type === "accept" || last.type === "final") break;
    bid = r2(bid + (last.price - bid) * (round === 1 ? 0.4 : 0.55), cur);
  }

  if (last.type !== "accept" && last.price + last.shipping >= offer.total) {
    yield dalil(ar ? "شكرًا، هنفضل على السعر الأصلي." : "Thanks — we'll keep the original price.");
    yield { type: "done", offer: null, saved: 0, transport };
    return;
  }
  if (last.type !== "accept") {
    yield { type: "typing", from: "dalil" };
    await wait(600, signal);
    yield dalil(ar ? `تمام، موافق على ${money(last.price, cur, ar)}.` : `OK, ${money(last.price, cur, ar)} works.`, last.price);
    last = await ask({ type: "accept" });
    await wait(450, signal);
    yield seller(last);
  }

  // Never sign whatever a seller endpoint says: the deal must be a plausible
  // discount on the signed offer (the demo seller's floor is 3–8% under list).
  const sane = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!sane(last.price, offer.price * 0.8, offer.price) || !sane(last.shipping, 0, offer.shipping ?? 0)) {
    yield dalil(ar ? "العرض ده مش منطقي — هنفضل على السعر الأصلي." : "That counter-offer doesn't add up — keeping the original price.");
    yield { type: "done", offer: null, saved: 0, transport };
    return;
  }
  const total = Math.round((last.price + last.shipping) * 100) / 100;
  const next = prepareOffer({
    ...offer,
    id: `${offer.id}-neg${Date.now().toString(36)}`,
    price: last.price,
    shipping: last.shipping,
    total,
    flags: Array.from(new Set([...(offer.flags ?? []), "negotiated"])),
    sig: undefined,
  });
  yield { type: "done", offer: next, saved: Math.round((offer.total - total) * 100) / 100, transport };
}
