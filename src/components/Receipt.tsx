"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ReceiptText } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/i18n";
import { PROTECTION_DAYS, type Lang, type Negotiation, type Offer, type Protection, type PurchaseContext } from "@/lib/types";

/** Money saved vs. the average trustworthy offer compared in the same search. */
export function savedVsMarket(offer: Offer, context?: PurchaseContext, negotiation?: Negotiation): number {
  const base = context ? Math.max(context.avgTotal, negotiation?.original.total ?? 0) : negotiation?.original.total ?? offer.total;
  return Math.max(0, Math.round((base - offer.total) * 100) / 100);
}

/**
 * "Trust receipt": after a purchase, why Dalil chose this offer and which
 * guarantees were enforced — the transparency an agent that spends money owes you.
 */
export function TrustReceipt({
  offer,
  lang,
  context,
  mandate,
  negotiation,
  orderId,
  captureId,
  refunded,
  protection,
}: {
  protection?: Protection;
  offer: Offer;
  lang: Lang;
  context?: PurchaseContext;
  mandate?: { maxSpend: number; verifiedOnly: boolean };
  negotiation?: Negotiation;
  orderId?: string;
  captureId?: string;
  refunded?: boolean;
}) {
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const m = (v: number) => formatMoney(offer.currency === "EGP" ? Math.round(v) : Math.round(v * 100) / 100, offer.currency, lang);
  const amt = (v: number) => <bdi dir={offer.currency === "USD" ? "ltr" : "auto"}>{m(v)}</bdi>;
  const saved = savedVsMarket(offer, context, negotiation);
  const negSaved = negotiation?.status === "done" ? negotiation.saved ?? 0 : 0;

  const rows: Array<{ ok: boolean; text: React.ReactNode }> = [];
  if (context) {
    rows.push({
      ok: true,
      text: ar ? (
        <>قارنت {context.compared} عروض من {context.stores} متاجر{context.rank ? <> — ده رقم {context.rank} في الترتيب</> : null}</>
      ) : (
        <>Compared {context.compared} offers from {context.stores} stores{context.rank ? <> — ranked #{context.rank}</> : null}</>
      ),
    });
    rows.push({
      ok: true,
      text: ar ? <>متوسط السوق {amt(context.avgTotal)} — دفعت {amt(offer.total)}</> : <>Market average {amt(context.avgTotal)} — you paid {amt(offer.total)}</>,
    });
    if (context.flaggedSkipped) {
      rows.push({
        ok: true,
        text: ar ? <>استبعدت {context.flaggedSkipped} عرض شكله وهمي</> : <>Skipped {context.flaggedSkipped} suspicious offer{context.flaggedSkipped > 1 ? "s" : ""}</>,
      });
    }
  }
  if (negSaved > 0) rows.push({ ok: true, text: ar ? <>فاوضت البائع ووفّرت {amt(negSaved)}</> : <>Negotiated {amt(negSaved)} off with the seller</> });
  rows.push({
    ok: offer.trust === "verified",
    text: offer.trust === "verified" ? (ar ? "متجر موثوق" : "Verified store") : ar ? "متجر غير معروف — اشتريت بموافقتك" : "Unverified store — bought with your approval",
  });
  if (mandate) {
    rows.push({
      ok: true,
      text:
        mandate.maxSpend > 0
          ? ar ? <>التزمت بحد الصرف ({amt(mandate.maxSpend)})</> : <>Stayed within your limit ({amt(mandate.maxSpend)})</>
          : ar ? "مفيش حد صرف متحدد — اشتريت بموافقتك" : "No spending limit set — bought with your approval",
    });
  }
  rows.push({ ok: true, text: ar ? "السعر متوقّع رقميًا — محدش يقدر يغيّره قبل الدفع" : "Price was cryptographically signed — no one could change it before payment" });
  rows.push({ ok: true, text: ar ? "المبلغ اتحجز الأول وكان قدامك 10 دقايق تلغي" : "Funds were held first with a 10-minute cancel window" });
  if (protection) {
    const back = Number(protection.refundedTotal) || 0;
    const cur = protection.charged.currency;
    const backM = <bdi dir={cur === "USD" ? "ltr" : "auto"}>{formatMoney(back, cur, lang)}</bdi>;
    rows.push({
      ok: true,
      text:
        back > 0
          ? ar ? <>حماية السعر: السعر نزل بعد الشراء فرجّعتلك {backM} على PayPal</> : <>Price protection: the price dropped after you bought, so {backM} came back to your PayPal</>
          : ar ? `حماية السعر ${PROTECTION_DAYS} يوم — لو السعر نزل هرجّعلك الفرق` : `Price protection for ${PROTECTION_DAYS} days — if the price drops, you get the difference back`,
    });
  }
  if (refunded) rows.push({ ok: true, text: ar ? "اترجعلك المبلغ عن طريق PayPal" : "Refunded through PayPal" });

  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start" aria-expanded={open}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-soft">
          <ReceiptText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{ar ? "إيصال الثقة" : "Trust receipt"}</span>
          <span className="block truncate text-[11.5px] text-fg-muted">
            {saved > 0
              ? ar ? <>وفّرت {amt(saved)} عن متوسط السوق</> : <>Saved {amt(saved)} vs. the market average</>
              : ar ? "ليه دليل اختار العرض ده" : "Why Dalil chose this offer"}
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="size-4 text-fg-muted" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <ul className="space-y-1.5 border-t border-dashed border-line px-3 py-2.5">
              {rows.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: ar ? 8 : -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-start gap-2 text-[12px] leading-snug text-fg-soft"
                  dir="auto"
                >
                  <span className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full ${r.ok ? "bg-inv-bg text-inv-fg" : "border border-line"}`}>
                    {r.ok ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
                  </span>
                  <span>{r.text}</span>
                </motion.li>
              ))}
            </ul>
            {(orderId || captureId) && (
              <div className="space-y-0.5 border-t border-dashed border-line px-3 py-2 font-mono text-[10.5px] text-fg-muted" dir="ltr">
                {orderId && <div>PayPal order · {orderId}</div>}
                {captureId && <div>Capture · {captureId}</div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
