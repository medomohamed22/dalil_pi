"use client";

import { animate, AnimatePresence, motion } from "framer-motion";
import { HandCoins, Handshake, ShieldCheck, ShoppingBag, TrendingDown, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/i18n";
import type { Lang, Market } from "@/lib/types";
import { protectionSavedInOfferCurrency } from "./Protection";
import { savedVsMarket } from "./Receipt";
import type { PurchaseRow } from "./SavingsGrid";

// AG Grid is heavy — load it only when the dashboard opens.
const SavingsGrid = dynamic(() => import("./SavingsGrid"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-bg-soft" />,
});

async function loadPurchases(): Promise<PurchaseRow[]> {
  const msgs = await db().messages.toArray();
  const rows: PurchaseRow[] = [];
  for (const m of msgs) {
    m.blocks.forEach((b, i) => {
      if (b.type !== "approval") return;
      if (b.status !== "captured" && b.status !== "held") return;
      rows.push({
        id: `${m.id}:${i}`,
        conversationId: m.conversationId,
        date: b.capturedAt ?? m.createdAt,
        title: b.offer.title,
        image: b.offer.image,
        store: b.offer.store,
        paid: b.offer.total,
        currency: b.offer.currency,
        saved: savedVsMarket(b.offer, b.context, b.negotiation) + protectionSavedInOfferCurrency(b.protection),
        negotiated: b.negotiation?.status === "done" ? b.negotiation.saved ?? 0 : 0,
        priceDrop: protectionSavedInOfferCurrency(b.protection),
        status: b.refund ? "refunded" : b.status === "held" ? "held" : "captured",
        orderId: b.orderId,
      });
    });
    // Multi-store carts: one row per item in each store that was paid (or is on hold).
    m.blocks.forEach((b, i) => {
      if (b.type !== "cart" || !b.units) return;
      for (const u of b.units) {
        if (u.status !== "captured" && u.status !== "held") continue;
        b.offers.forEach((o, j) => {
          if (o.store !== u.store) return;
          rows.push({
            id: `${m.id}:${i}:${j}`,
            conversationId: m.conversationId,
            date: m.createdAt,
            title: o.title,
            image: o.image,
            store: o.store,
            paid: o.total,
            currency: o.currency,
            saved: 0,
            negotiated: 0,
            priceDrop: 0,
            status: u.status === "held" ? "held" : "captured",
            orderId: b.orderId,
          });
        });
      }
    });
  }
  return rows.sort((a, b) => b.date - a.date);
}

function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => c.stop();
  }, [value]);
  return <>{format(v)}</>;
}

export default function SavingsPanel({
  open,
  lang,
  market,
  onClose,
  onOpenChat,
}: {
  open: boolean;
  lang: Lang;
  market: Market;
  onClose: () => void;
  onOpenChat: (conversationId: string) => void;
}) {
  const ar = lang === "ar";
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [rate, setRate] = useState(50);

  useEffect(() => {
    if (!open) return;
    loadPurchases().then(setRows);
    fetch("/api/paypal/status")
      .then((r) => r.json())
      .then((j: { egpPerUsd?: number }) => j.egpPerUsd && setRate(j.egpPerUsd))
      .catch(() => {});
  }, [open]);

  // Everything is summed in the market's currency.
  const cur = market === "EG" ? "EGP" : "USD";
  const conv = (v: number, c: string) => (c === cur ? v : c === "USD" && cur === "EGP" ? v * rate : c === "EGP" && cur === "USD" ? v / rate : v);
  const stats = useMemo(() => {
    const kept = (rows ?? []).filter((r) => r.status !== "refunded");
    const saved = kept.reduce((a, r) => a + conv(r.saved, r.currency), 0);
    const spent = kept.reduce((a, r) => a + conv(r.paid, r.currency), 0);
    const negotiated = kept.reduce((a, r) => a + conv(r.negotiated, r.currency), 0);
    const priceDrops = kept.reduce((a, r) => a + conv(r.priceDrop ?? 0, r.currency), 0);
    return { count: kept.length, saved, spent: spent - priceDrops, negotiated, priceDrops, pct: spent + saved > 0 ? Math.round((saved / (spent + saved)) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rate, cur]);
  const money = (v: number) => formatMoney(cur === "EGP" ? Math.round(v) : Math.round(v * 100) / 100, cur, lang);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label={ar ? "مشترياتي وتوفيري" : "My purchases & savings"}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:bottom-auto sm:end-0 sm:start-auto sm:h-full sm:max-h-none sm:w-[44rem] sm:rounded-none sm:border-s sm:border-t-0"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <HandCoins className="size-4" /> {ar ? "مشترياتي وتوفيري" : "My purchases & savings"}
              </h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6">
              {/* Hero: animated savings counter */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-inv-bg px-5 py-6 text-inv-fg"
              >
                <div className="savings-shine pointer-events-none absolute inset-0" />
                <div className="text-[12px] opacity-70">{ar ? "وفّرت مع دليل" : "Saved with Dalil"}</div>
                <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums" dir={cur === "USD" ? "ltr" : "auto"}>
                  {rows ? <CountUp value={stats.saved} format={money} /> : "—"}
                </div>
                <div className="mt-1 text-[12px] opacity-70">
                  {ar
                    ? `على ${stats.count} ${stats.count === 1 ? "عملية شراء" : "عمليات شراء"} · ${stats.pct}% أقل من متوسط السوق`
                    : `across ${stats.count} purchase${stats.count === 1 ? "" : "s"} · ${stats.pct}% below market average`}
                </div>
              </motion.div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { icon: ShoppingBag, k: ar ? "صرفت" : "Spent", v: money(stats.spent) },
                  { icon: Handshake, k: ar ? "من التفاوض" : "Negotiated", v: money(stats.negotiated) },
                  { icon: TrendingDown, k: ar ? "رجع من نزول السعر" : "Price-drop refunds", v: money(stats.priceDrops) },
                  { icon: ShieldCheck, k: ar ? "مشتريات آمنة" : "Protected buys", v: String(stats.count) },
                ].map((t, i) => (
                  <motion.div
                    key={t.k}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.05 }}
                    className="rounded-2xl border border-line p-3"
                  >
                    <t.icon className="size-4 text-fg-muted" />
                    <div className="mt-2 truncate text-[15px] font-semibold tabular-nums" dir="auto">
                      {t.v}
                    </div>
                    <div className="text-[11px] text-fg-muted">{t.k}</div>
                  </motion.div>
                ))}
              </div>

              {rows && rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-muted">
                  <HandCoins className="size-8" strokeWidth={1.25} />
                  {ar ? "لسه مفيش مشتريات — أول ما تشتري هتلاقي توفيرك هنا." : "No purchases yet — your savings will show up here."}
                </div>
              ) : rows ? (
                <SavingsGrid
                  rows={rows}
                  lang={lang}
                  onOpen={(r) => {
                    onOpenChat(r.conversationId);
                    onClose();
                  }}
                />
              ) : null}
              <p className="text-center text-[11px] text-fg-muted">
                {ar
                  ? "التوفير = متوسط العروض الموثوقة اللي اتقارنت − اللي دفعته (شامل التفاوض واسترداد نزول السعر). محفوظ على جهازك بس."
                  : "Savings = average of the trustworthy offers compared − what you paid (incl. negotiation and price-drop refunds). Stored only on this device."}
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
