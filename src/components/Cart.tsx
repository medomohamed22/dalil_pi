"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Clock, Loader2, Lock, ShoppingCart, Store, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/i18n";
import type { Block, CartUnit, Lang, Offer } from "@/lib/types";
import { HOLD_MINUTES } from "@/lib/types";

export type CartBlock = Extract<Block, { type: "cart" }>;
export type CartAction = "approve" | "decline" | "remove" | "cancelUnit" | "captureUnit" | "cancelAll" | "captureAll" | "retry";

/** Group cart offers by store, the way the server builds purchase units. */
export function byStore(offers: Offer[]): Array<{ store: string; offers: Offer[]; shipping: number; subtotal: number }> {
  const m = new Map<string, Offer[]>();
  for (const o of offers) m.set(o.store, [...(m.get(o.store) ?? []), o]);
  return [...m.entries()].map(([store, list]) => {
    const shipping = Math.max(...list.map((o) => o.shipping ?? 0));
    return { store, offers: list, shipping, subtotal: Math.round((list.reduce((a, o) => a + o.price, 0) + shipping) * 100) / 100 };
  });
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const UNIT_LABEL: Record<CartUnit["status"], { ar: string; en: string }> = {
  pending: { ar: "مستني", en: "Pending" },
  held: { ar: "محجوز", en: "Held" },
  captured: { ar: "اتخصم", en: "Charged" },
  refunded: { ar: "اترجع", en: "Refunded" },
  voided: { ar: "اتلغى", en: "Released" },
  error: { ar: "خطأ", en: "Error" },
};

/**
 * Multi-store cart: one PayPal approval for several stores. PayPal only allows
 * immediate capture for multi-store orders, so each store is paid on approval
 * with its own capture — and any store can be cancelled for a full refund
 * during the 10-minute window.
 */
export function CartCard({
  block,
  lang,
  onAction,
}: {
  block: CartBlock;
  lang: Lang;
  onAction: (action: CartAction, arg?: number) => Promise<void> | void;
}) {
  const ar = lang === "ar";
  const groups = byStore(block.offers);
  const currency = block.offers[0]?.currency ?? "USD";
  const total = Math.round(groups.reduce((a, g) => a + g.subtotal, 0) * 100) / 100;
  const m = (v: number | string, c = currency) => <bdi dir={c === "USD" ? "ltr" : "auto"}>{formatMoney(Number(v), c, lang)}</bdi>;
  const now = useNow(block.status === "held");
  const left = Math.max(0, (block.holdExpiresAt ?? 0) - now);
  // "held" = paid and still inside the cancel window; after it, show as paid.
  const held = block.status === "held" && left > 0;
  const status = block.status === "held" && !held ? "captured" : block.status;
  const clock = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const unitFor = (store: string) => block.units?.find((u) => u.store === store);
  const unitIdx = (store: string) => block.units?.findIndex((u) => u.store === store) ?? -1;
  const [busy, setBusy] = useState<string>("");
  const run = async (k: string, a: CartAction, arg?: number) => {
    setBusy(k);
    try {
      await onAction(a, arg);
    } finally {
      setBusy("");
    }
  };
  const converted = block.offers[0]?.chargeCurrency && block.offers[0].chargeCurrency !== currency;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-bg shadow-card"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="size-4" />
          {ar ? "سلة من أكتر من متجر" : "Multi-store cart"}
        </div>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-muted">
          {ar ? `${groups.length} متاجر · موافقة واحدة` : `${groups.length} store${groups.length === 1 ? "" : "s"} · one approval`}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <ul className="space-y-2.5">
          {groups.map((g) => {
            const u = unitFor(g.store);
            const ui = unitIdx(g.store);
            return (
              <li key={g.store} className="rounded-2xl border border-line p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                    <Store className="size-3.5 shrink-0" />
                    <span className="truncate">{g.store}</span>
                  </span>
                  {u && block.status !== "pending" ? (
                    <span
                      className={`rounded-full px-2 text-[11px] leading-5 ${
                        u.status === "held" || u.status === "captured" ? "bg-inv-bg text-inv-fg" : u.status === "error" ? "border border-danger/40 text-danger" : "border border-line text-fg-muted"
                      }`}
                    >
                      {UNIT_LABEL[u.status][lang]}
                    </span>
                  ) : (
                    <span className="text-[13px] font-semibold tabular-nums">{m(g.subtotal)}</span>
                  )}
                </div>
                <ul className="space-y-1">
                  {g.offers.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-2 text-[12.5px]">
                      <span className="line-clamp-2 min-w-0 flex-1 text-fg-soft" dir="auto">
                        {o.title}
                      </span>
                      <span className="shrink-0 tabular-nums">{m(o.price)}</span>
                      {block.status === "pending" && block.offers.length > 1 && (
                        <button
                          onClick={() => run(`rm${o.id}`, "remove", block.offers.indexOf(o))}
                          className="shrink-0 rounded-full p-0.5 text-fg-muted hover:bg-bg-soft"
                          aria-label={ar ? "شيل من السلة" : "Remove from cart"}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                  <li className="flex justify-between text-[11.5px] text-fg-muted">
                    <span>{ar ? "الشحن" : "Shipping"}</span>
                    <span className="tabular-nums">{g.shipping ? m(g.shipping) : ar ? "مجاني" : "Free"}</span>
                  </li>
                </ul>
                {u?.message && <p className="mt-1 text-[11px] text-danger">{u.message}</p>}
                {held && u?.status === "captured" && ui >= 0 && (
                  <div className="mt-2">
                    <button
                      disabled={!!busy}
                      onClick={() => run(`c${ui}`, "cancelUnit", ui)}
                      className="w-full rounded-xl border border-fg py-1.5 text-[11.5px] font-semibold disabled:opacity-50"
                    >
                      {busy === `c${ui}` ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : ar ? "إلغاء المتجر ده (استرداد كامل)" : "Cancel this store (full refund)"}
                    </button>
                  </div>
                )}
                {u?.captureId && (
                  <div className="mt-1 truncate font-mono text-[10px] text-fg-muted" dir="ltr">
                    Capture · {u.captureId}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <dl className="space-y-1 rounded-2xl bg-bg-soft p-3 text-sm">
          <div className="flex justify-between font-semibold">
            <dt>{ar ? "الإجمالي" : "Total"}</dt>
            <dd className="tabular-nums">{m(total)}</dd>
          </div>
          {converted && (
            <div className="flex justify-between text-xs text-fg-muted">
              <dt>{ar ? "المبلغ في PayPal" : "Charged via PayPal"}</dt>
              <dd className="tabular-nums" dir="ltr">
                {block.charge
                  ? formatMoney(Number(block.charge.value), block.charge.currency, "en")
                  : formatMoney(Math.round(block.offers.reduce((a, o) => a + (o.chargeAmount ?? 0), 0) * 100) / 100, block.offers[0].chargeCurrency!, "en")}
              </dd>
            </div>
          )}
        </dl>

        {block.shipping?.address && (
          <div className="text-xs text-fg-muted" dir="auto">
            <span className="font-medium text-fg-soft">{block.shipping.name}</span>
            {block.shipping.name ? " · " : ""}
            {block.shipping.address}
          </div>
        )}

        <AnimatePresence mode="wait">
          {block.status === "pending" ? (
            <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => run("approve", "approve")}
                className="w-full rounded-2xl bg-inv-bg py-3.5 text-sm font-semibold text-inv-fg"
              >
                {ar ? `وافق على ${groups.length} متاجر مرة واحدة بـ PayPal` : `Approve ${groups.length} store${groups.length === 1 ? "" : "s"} at once with PayPal`}
              </motion.button>
              <button onClick={() => run("decline", "decline")} className="w-full rounded-2xl border border-line py-2.5 text-sm font-medium text-fg-soft hover:bg-bg-soft">
                {ar ? "مش دلوقتي" : "Not now"}
              </button>
              <p className="text-center text-[11px] leading-snug text-fg-muted">
                {ar
                  ? "طلب PayPal واحد فيه جزء لكل متجر. كل متجر بيتخصمله لوحده، ومعاك 10 دقايق تلغي أي متجر وفلوسه ترجعلك كاملة."
                  : `One PayPal order with a part per store. Each store is charged separately — cancel any store within ${HOLD_MINUTES} minutes for a full refund.`}
              </p>
            </motion.div>
          ) : held ? (
            <motion.div key="h" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <Clock className="size-3.5" />
                  {ar ? "تقدر تلغي أي متجر خلال" : "Cancel any store for a full refund within"}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">
                  {clock}
                </span>
              </div>
              <div className="flex gap-2">
                <button disabled={!!busy} onClick={() => run("ca", "cancelAll")} className="flex-1 rounded-2xl border border-fg py-2.5 text-xs font-semibold disabled:opacity-50">
                  {busy === "ca" ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : ar ? "إلغاء الكل" : "Cancel all"}
                </button>
                <button disabled={!!busy} onClick={() => run("ka", "captureAll")} className="flex-1 rounded-2xl bg-inv-bg py-2.5 text-xs font-semibold text-inv-fg disabled:opacity-50">
                  {busy === "ka" ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : ar ? "تمام، خلّصت" : "Keep all"}
                </button>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-fg-muted">
                <Lock className="mt-0.5 size-3 shrink-0" />
                {ar ? "اتدفع بموافقة واحدة في PayPal. لو لغيت متجر، فلوسه بترجع كاملة لحسابك في PayPal فورًا." : "Paid with one PayPal approval. Cancel a store and its part is refunded to your PayPal in full right away."}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-sm font-semibold ${
                status === "captured" ? "bg-inv-bg text-inv-fg" : "bg-bg-soft"
              } ${status === "error" ? "text-danger" : ""}`}
            >
              {status === "processing" && <Loader2 className="size-4 shrink-0 animate-spin" />}
              {status === "captured" && <Check className="size-4 shrink-0" />}
              {block.status === "error" && <AlertTriangle className="size-4 shrink-0" />}
              <span>
                {status === "processing"
                  ? ar ? "بيستنى موافقة PayPal…" : "Waiting for PayPal approval…"
                  : status === "captured"
                    ? ar ? "اتدفع — كل متجر اتخصمله لوحده" : "Paid — each store charged separately"
                    : status === "voided"
                      ? ar ? "اتلغى — كل المتاجر رجّعت فلوسها" : "Cancelled — every store refunded"
                      : status === "declined"
                        ? ar ? "اترفض" : "Declined"
                        : block.message}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {block.status === "error" && (
          <button onClick={() => run("retry", "retry")} className="w-full rounded-2xl border border-line py-2.5 text-xs font-medium hover:bg-bg-soft">
            {ar ? "حاول تاني" : "Try again"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
