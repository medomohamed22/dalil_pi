"use client";

import { motion } from "framer-motion";
import { BellRing, CalendarDays, Check, Hourglass, ShoppingBag } from "lucide-react";
import { useId } from "react";
import { formatMoney } from "@/lib/i18n";
import type { Lang, Offer, PriceInsight, WatchMode } from "@/lib/types";

const n = (v: number, ar: boolean) => v.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US");

function headline(i: PriceInsight, ar: boolean): string {
  const pct = i.stats.mean ? Math.round(((i.price - i.stats.mean) / i.stats.mean) * 100) : 0;
  switch (i.reason) {
    case "near_lowest":
      return ar ? `السعر دلوقتي قريب من أقل سعر في آخر ${n(i.stats.days, ar)} يوم` : `Near the lowest price of the last ${i.stats.days} days`;
    case "sale_soon":
      return ar
        ? `${i.event!.ar} بعد ${n(i.event!.daysAway, ar)} يوم — غالبًا هينزل حوالي ${n(i.event!.drop, ar)}٪`
        : `${i.event!.en} is in ${i.event!.daysAway} days — prices usually drop ~${i.event!.drop}%`;
    case "above_average":
      return ar ? `السعر أعلى من المتوسط بـ ${n(pct, ar)}٪ — غالبًا هينزل` : `${pct}% above its usual price — likely to drop`;
    case "fair_price":
      return ar ? "سعر عادل، ومفيش عروض كبيرة قريبة" : "A fair price, and no big sale coming soon";
    default:
      return ar ? "مفيش عروض كبيرة قريبة — وبدأت أسجّل سعره عشان أنبهك" : "No big sale coming soon — I've started tracking its price";
  }
}

function Sparkline({ i, ar }: { i: PriceInsight; ar: boolean }) {
  const gid = useId().replace(/:/g, "");
  const W = 320;
  const H = 76;
  const pad = 10;
  const pts = i.history;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t || t0 + 1;
  const lo = Math.min(i.stats.min, i.targetPrice ?? Infinity);
  const hi = i.stats.max;
  const span = hi - lo || hi * 0.05 || 1;
  const x = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad * 2);
  const y = (p: number) => pad + (1 - (p - lo) / span) * (H - pad * 2);
  const line = pts.map((q, k) => `${k ? "L" : "M"}${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${H} L${x(t0).toFixed(1)},${H} Z`;
  const last = pts[pts.length - 1];
  const minPt = pts.reduce((a, b) => (b.p < a.p ? b : a), pts[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[76px] w-full text-fg" preserveAspectRatio="none" role="img" aria-label={ar ? "تاريخ السعر" : "Price history"}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }} />
      {i.targetPrice ? (
        <line x1={pad} x2={W - pad} y1={y(i.targetPrice)} y2={y(i.targetPrice)} stroke="currentColor" strokeOpacity="0.45" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      ) : null}
      <motion.path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeInOut" }}
      />
      <circle cx={x(minPt.t)} cy={y(minPt.p)} r="3" fill="var(--bg)" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <motion.circle cx={x(last.t)} cy={y(last.p)} r="4" fill="currentColor" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.05 }} />
      <circle cx={x(last.t)} cy={y(last.p)} r="4" fill="currentColor" className="insight-ping" />
    </svg>
  );
}

export function InsightCard({
  offer,
  insight: i,
  lang,
  onBuy,
  onWatch,
}: {
  offer: Offer;
  insight: PriceInsight;
  lang: Lang;
  onBuy: (o: Offer) => void;
  onWatch?: (d: { offer: Offer; targetPrice?: number; mode?: WatchMode }) => void;
}) {
  const ar = lang === "ar";
  const wait = i.verdict === "wait";
  const m = (v: number) => formatMoney(i.currency === "EGP" ? Math.round(v) : Math.round(v * 100) / 100, i.currency, lang);
  const amtDir = i.currency === "USD" ? "ltr" : "auto";
  const showChart = i.history.length >= 3;
  const src =
    i.source === "sample"
      ? ar ? "بيانات تجريبية" : "Sample data"
      : i.source === "channel3"
        ? ar ? `تاريخ السعر من Channel3 · ${n(i.stats.points, ar)} نقطة` : `Price history from Channel3 · ${i.stats.points} point${i.stats.points === 1 ? "" : "s"}`
        : i.source === "dalil"
          ? ar ? `أسعار رصدها دليل · ${n(i.stats.points, ar)} نقطة` : `Prices tracked by Dalil · ${i.stats.points} point${i.stats.points === 1 ? "" : "s"}`
          : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-bg shadow-card"
    >
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">{ar ? "اشتري دلوقتي ولا تستنى؟" : "Buy now or wait?"}</span>
        <span className="ms-auto text-[11px] text-fg-muted">
          {ar ? { high: "ثقة عالية", medium: "ثقة متوسطة", low: "تقدير مبدئي" }[i.confidence] : { high: "High confidence", medium: "Medium confidence", low: "Early estimate" }[i.confidence]}
        </span>
      </div>
      <div className="flex items-start gap-3 px-4 pt-2">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15, stiffness: 260, delay: 0.1 }}
          className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
            wait ? "border border-fg text-fg" : "bg-inv-bg text-inv-fg"
          }`}
        >
          {wait ? <Hourglass className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} />}
          {wait ? (ar ? "استنى شوية" : "Wait") : ar ? "اشتري دلوقتي" : "Buy now"}
        </motion.span>
        <p className="text-[13.5px] leading-snug text-fg-soft" dir="auto">
          {headline(i, ar)}
        </p>
      </div>

      {showChart && (
        <div className="px-3 pt-2">
          <Sparkline i={i} ar={ar} />
          <div className="mt-1 grid grid-cols-3 gap-1 px-1 text-center">
            {[
              { k: ar ? "الأقل" : "Low", v: i.stats.min },
              { k: ar ? "المتوسط" : "Average", v: i.stats.mean },
              { k: ar ? "دلوقتي" : "Now", v: i.price, strong: true },
            ].map((c) => (
              <div key={c.k} className="min-w-0">
                <div className="text-[10.5px] text-fg-muted">{c.k}</div>
                <div className={`truncate text-[12.5px] tabular-nums ${c.strong ? "font-semibold text-fg" : "text-fg-soft"}`}>
                  <bdi dir={amtDir}>{m(c.v)}</bdi>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {i.event && i.event.daysAway <= 60 && i.reason !== "sale_soon" && (
        <div className="mx-4 mt-2 inline-flex items-center gap-1.5 rounded-full bg-bg-soft px-2.5 py-1 text-[11px] text-fg-soft">
          <CalendarDays className="size-3" />
          {ar ? `${i.event.ar} بعد ${n(i.event.daysAway, ar)} يوم` : `${i.event.en} in ${i.event.daysAway} days`}
        </div>
      )}

      <div className="p-4 pt-3">
        {wait && onWatch ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onWatch({ offer, targetPrice: i.targetPrice, mode: "notify" })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg"
          >
            <BellRing className="size-4" />
            {i.targetPrice
              ? ar ? <>راقبه وبلّغني لما ينزل تحت <bdi dir={amtDir}>{m(i.targetPrice)}</bdi></> : <>Watch it — alert me under {m(i.targetPrice)}</>
              : ar ? "راقب السعر" : "Watch the price"}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onBuy(offer)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm font-semibold transition-colors hover:bg-bg-soft"
          >
            <ShoppingBag className="size-4" />
            {ar ? `اشتريه دلوقتي من ${offer.store}` : `Buy now from ${offer.store}`}
          </motion.button>
        )}
        {src && <p className="mt-2 text-center text-[10.5px] text-fg-muted">{src}</p>}
      </div>
    </motion.div>
  );
}
