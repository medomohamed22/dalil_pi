"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Handshake, Store } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatMoney } from "@/lib/i18n";
import type { Lang, Negotiation, Offer } from "@/lib/types";
import Logo from "./Logo";

/** Live agent-to-agent chat: Dalil (buyer) ↔ the store's seller agent. */
export function NegotiationPanel({ neg, offer, lang }: { neg: Negotiation; offer: Offer; lang: Lang }) {
  const ar = lang === "ar";
  const scroller = useRef<HTMLDivElement>(null);
  const running = neg.status === "running";
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [neg.messages.length, neg.typing]);

  const lastSeller = [...neg.messages].reverse().find((m) => m.from === "seller" && m.price != null);
  const current = lastSeller?.price ?? neg.original.price;
  const drop = Math.max(0, neg.original.price - current);
  const pct = neg.original.price ? Math.min(1, drop / (neg.original.price * 0.1)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden rounded-2xl border border-line"
    >
      <div className="flex items-center gap-2 border-b border-line bg-bg-soft px-3 py-2">
        <div className="flex -space-x-1.5 rtl:space-x-reverse">
          <span className="relative z-10 rounded-full ring-2 ring-bg-soft">
            <Logo size={22} />
          </span>
          <span className="flex size-[22px] items-center justify-center rounded-full border border-line bg-bg ring-2 ring-bg-soft">
            <Store className="size-3" />
          </span>
        </div>
        <div className="min-w-0 flex-1 text-[12px] font-semibold">
          {ar ? `دليل ↔ وكيل ${offer.store}` : `Dalil ↔ ${offer.store}'s agent`}
          <span className="ms-1.5 font-normal text-fg-muted">{ar ? "· تفاوض بين وكيلين" : "· agent-to-agent"}</span>
        </div>
        {running ? <span className="live-dot size-1.5 rounded-full bg-fg" /> : null}
      </div>

      {/* Price meter: how far the seller has come down (scaled to a 10% discount). */}
      <div className="px-3 pt-2.5">
        <div className="flex items-baseline justify-between text-[11px] text-fg-muted">
          <span>{ar ? "سعر البائع دلوقتي" : "Seller's price now"}</span>
          <motion.span key={current} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-[13px] font-semibold tabular-nums text-fg">
            <bdi dir={offer.currency === "USD" ? "ltr" : "auto"}>{formatMoney(current, offer.currency, lang)}</bdi>
          </motion.span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-muted">
          <motion.div className="h-full rounded-full bg-fg" initial={{ width: 0 }} animate={{ width: `${Math.round(pct * 100)}%` }} transition={{ type: "spring", damping: 20, stiffness: 120 }} />
        </div>
      </div>

      <div ref={scroller} className="max-h-64 space-y-2 overflow-y-auto px-3 py-3">
        <AnimatePresence initial={false}>
          {neg.messages.map((m, i) => {
            const me = m.from === "dalil";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.22 }}
                className={`flex ${me ? "justify-start" : "justify-end"}`}
              >
                <div
                  dir="auto"
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug ${
                    me ? "rounded-ss-md bg-inv-bg text-inv-fg" : "rounded-se-md border border-line bg-bg text-fg"
                  }`}
                >
                  <div className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wider ${me ? "opacity-60" : "text-fg-muted"}`}>
                    {me ? (ar ? "دليل" : "Dalil") : ar ? `وكيل ${offer.store}` : `${offer.store} agent`}
                  </div>
                  {m.text}
                </div>
              </motion.div>
            );
          })}
          {neg.typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`flex ${neg.typing === "dalil" ? "justify-start" : "justify-end"}`}
            >
              <div className={`flex gap-1 rounded-2xl px-3 py-2.5 ${neg.typing === "dalil" ? "bg-inv-bg text-inv-fg" : "border border-line"}`}>
                {[0, 1, 2].map((d) => (
                  <span key={d} className="typing-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {neg.status === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 border-t border-line px-3 py-2.5 text-[12.5px]"
          >
            <motion.span initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", damping: 10 }}>
              <Handshake className="size-4" />
            </motion.span>
            {neg.saved && neg.saved > 0 ? (
              <span className="font-semibold">
                {ar ? "وفّرت " : "You saved "}
                <bdi dir={offer.currency === "USD" ? "ltr" : "auto"}>{formatMoney(neg.saved, offer.currency, lang)}</bdi>
                {ar ? " بالتفاوض" : " by negotiating"}
              </span>
            ) : (
              <span className="text-fg-muted">{ar ? "البائع ما نزلش — السعر الأصلي هو الأحسن" : "No better price — the original stands"}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
