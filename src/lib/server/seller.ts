import "server-only";
import { createHash } from "node:crypto";
import { signToken, verifyToken } from "./sign";

/**
 * Demo SELLER agent — what a store's own AI agent could expose.
 * Speaks a tiny JSON protocol ("dalil-negotiation/1") over HTTP:
 *
 *   → { protocol, session?, item: {title, store, price, shipping, currency}, message: {type: "hello" | "bid" | "accept", price?, ask?} }
 *   ← { protocol, session, message: {type: "greeting" | "counter" | "accept" | "final", price, shipping, perks[], text_en, text_ar} }
 *
 * Its pricing policy is private and deterministic per item: a hidden floor
 * (3–8% under list), concessions that shrink each round, free shipping as a
 * sweetener. State lives in a signed token, so the endpoint is stateless.
 */
export const PROTOCOL = "dalil-negotiation/1";

export interface Item {
  title: string;
  store: string;
  price: number;
  shipping: number;
  currency: string;
}
export interface SellerMsg {
  type: "greeting" | "counter" | "accept" | "final";
  price: number;
  shipping: number;
  perks: string[];
  text_en: string;
  text_ar: string;
}
interface State {
  h: string;
  round: number;
  last: number;
  shipping: number;
}

const r2 = (v: number, cur: string) => (cur === "EGP" ? Math.round(v / 5) * 5 : Math.round(v * 100) / 100);
const fmt = (v: number, cur: string) => (cur === "USD" ? `$${v.toLocaleString("en-US")}` : `${v.toLocaleString("en-US")} ${cur === "EGP" ? "EGP" : cur}`);
const fmtAr = (v: number, cur: string) => (cur === "USD" ? `$${v.toLocaleString("en-US")}` : `${v.toLocaleString("en-US")} ${cur === "EGP" ? "ج.م" : cur}`);

function itemHash(it: Item) {
  return createHash("sha256").update(`${it.store}|${it.title}|${it.price}|${it.currency}`).digest("hex");
}

/** Private policy: how low this store will go. */
function floorOf(it: Item, h: string) {
  const pct = 0.03 + (parseInt(h.slice(0, 4), 16) % 51) / 1000; // 3.0% – 8.0%
  return r2(it.price * (1 - pct), it.currency);
}

export function sellerTurn(input: {
  session?: string;
  item: Item;
  message: { type: "hello" | "bid" | "accept"; price?: number; ask?: string[] };
}): { session: string; message: SellerMsg } {
  const it = input.item;
  const h = itemHash(it);
  const prev = verifyToken<State>(input.session);
  const st: State = prev && prev.h === h ? prev : { h, round: 0, last: it.price, shipping: it.shipping };
  const floor = floorOf(it, h);
  const c = it.currency;
  const perks: string[] = [];
  let msg: SellerMsg;

  if (input.message.type === "hello" || !prev) {
    msg = {
      type: "greeting",
      price: it.price,
      shipping: it.shipping,
      perks,
      text_en: `Hi! This is ${it.store}'s sales agent. The ${it.title} is ${fmt(it.price, c)}${it.shipping ? ` + ${fmt(it.shipping, c)} shipping` : " with free shipping"}. What did you have in mind?`,
      text_ar: `أهلًا! أنا وكيل المبيعات بتاع ${it.store}. سعر ${it.title} هو ${fmtAr(it.price, c)}${it.shipping ? ` + ${fmtAr(it.shipping, c)} شحن` : " والشحن مجاني"}. حابب تعرض كام؟`,
    };
  } else if (input.message.type === "accept") {
    msg = {
      type: "accept",
      price: st.last,
      shipping: st.shipping,
      perks,
      text_en: `Deal at ${fmt(st.last, c)}. I've reserved it for you — the price is locked for 15 minutes.`,
      text_ar: `اتفقنا على ${fmtAr(st.last, c)}. حجزتهولك، والسعر ثابت لمدة ١٥ دقيقة.`,
    };
  } else {
    const bid = Math.max(0, Number(input.message.price) || 0);
    st.round += 1;
    if (st.shipping > 0 && (input.message.ask?.includes("free_shipping") || st.round >= 2)) {
      st.shipping = 0;
      perks.push("free_shipping");
    }
    if (bid >= floor && bid >= st.last * 0.985) {
      st.last = r2(Math.max(bid, floor), c);
      msg = {
        type: "accept",
        price: st.last,
        shipping: st.shipping,
        perks,
        text_en: `You drive a hard bargain — ${fmt(st.last, c)} it is${perks.includes("free_shipping") ? ", and shipping is on us" : ""}.`,
        text_ar: `ماشي، اتفقنا على ${fmtAr(st.last, c)}${perks.includes("free_shipping") ? " والشحن علينا" : ""}.`,
      };
    } else if (st.round >= 3) {
      st.last = r2(Math.max(floor, Math.min(st.last, (st.last + bid) / 2)), c);
      msg = {
        type: "final",
        price: st.last,
        shipping: st.shipping,
        perks,
        text_en: `${fmt(st.last, c)} is my final price${st.shipping === 0 && it.shipping ? " with free shipping" : ""}. I can't go lower.`,
        text_ar: `${fmtAr(st.last, c)} ده آخر سعر${st.shipping === 0 && it.shipping ? " مع شحن مجاني" : ""}، مقدرش أنزل أكتر من كده.`,
      };
    } else {
      // Concede part of the gap, never below the floor; concessions shrink each round.
      const give = [0, 0.45, 0.35][st.round] ?? 0.3;
      st.last = r2(Math.max(floor, st.last - (st.last - Math.max(bid, floor)) * give), c);
      msg = {
        type: "counter",
        price: st.last,
        shipping: st.shipping,
        perks,
        text_en:
          st.round === 1
            ? `That's too low for a new unit with warranty. I can do ${fmt(st.last, c)}${perks.includes("free_shipping") ? " and free shipping" : ""}.`
            : `Meet me closer to the middle — ${fmt(st.last, c)}.`,
        text_ar:
          st.round === 1
            ? `ده قليل على جهاز جديد بضمان. أقدر أعملهولك بـ ${fmtAr(st.last, c)}${perks.includes("free_shipping") ? " وشحن مجاني" : ""}.`
            : `قرّب شوية — ${fmtAr(st.last, c)}.`,
      };
    }
  }
  return { session: signToken(st), message: msg };
}
