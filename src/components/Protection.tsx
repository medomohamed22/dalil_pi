"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RotateCcw, ShieldCheck, TrendingDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/i18n";
import type { Lang, Offer, Protection } from "@/lib/types";
import { deviceId } from "@/lib/watch-client";

/* ---------------- API ---------------- */

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-device-id": await deviceId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}

export const protectionApi = {
  create: (b: { captureId: string; captureToken: string; offer: Offer; demo: boolean }) => call<{ protection: Protection }>("/api/protection", b),
  get: (id: string) => call<{ protection: Protection }>(`/api/protection/${id}`),
  simulate: (id: string, price?: number) => call<{ protection: Protection }>(`/api/protection/${id}`, { action: "simulate", price }),
  list: () => call<{ protections: Protection[] }>("/api/protection"),
};

/** Refunded amount converted back into the offer's currency (for savings). */
export function protectionSavedInOfferCurrency(p?: Protection): number {
  if (!p) return 0;
  const r = Number(p.refundedTotal) || 0;
  return p.charged.currency !== p.currency && p.fxRate ? r * p.fxRate : r;
}

/* ---------------- Panel on a captured purchase ---------------- */

/**
 * "Price protection · 14 days": turned on automatically after the capture.
 * Dalil keeps checking the price; a drop is paid back as a partial PayPal refund.
 */
export function PriceProtectionPanel({
  lang,
  offer,
  captureId,
  captureToken,
  demo,
  protection,
  onUpdate,
}: {
  lang: Lang;
  offer: Offer;
  captureId?: string;
  captureToken?: string;
  demo: boolean;
  protection?: Protection;
  onUpdate: (p: Protection) => void;
}) {
  const ar = lang === "ar";
  const [busy, setBusy] = useState<"" | "on" | "sim">("");
  const [err, setErr] = useState("");
  const tried = useRef(false);

  const turnOn = async () => {
    if (!captureId || !captureToken) return;
    setBusy("on");
    setErr("");
    try {
      onUpdate((await protectionApi.create({ captureId, captureToken, offer, demo })).protection);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  // Protection is on by default: register as soon as the purchase is captured.
  useEffect(() => {
    if (protection || tried.current || !captureId || !captureToken) return;
    tried.current = true;
    turnOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protection, captureId, captureToken]);

  // Refresh while active (the server checks live prices; cron runs every 10 min).
  const id = protection?.id;
  const active = protection?.status === "active";
  useEffect(() => {
    if (!id || !active) return;
    const tick = () => {
      if (document.visibilityState === "visible") protectionApi.get(id).then((r) => onUpdate(r.protection)).catch(() => {});
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active]);

  if (!captureId || !captureToken) return null;
  const m = (v: number, c: string) => <bdi dir={c === "USD" ? "ltr" : "auto"}>{formatMoney(c === "EGP" ? Math.round(v) : Math.round(v * 100) / 100, c, lang)}</bdi>;
  const date = (t: number) => new Date(t).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "short" });

  if (!protection) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-3 py-2.5 text-xs">
        <ShieldCheck className="size-4 shrink-0" />
        <span className="flex-1 text-fg-soft">
          {busy === "on"
            ? ar ? "بشغّل حماية السعر…" : "Turning on price protection…"
            : err || (ar ? "حماية السعر لمدة 14 يوم" : "Price protection for 14 days")}
        </span>
        {busy === "on" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <button onClick={turnOn} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold hover:bg-bg-soft">
            {ar ? "شغّل" : "Turn on"}
          </button>
        )}
      </div>
    );
  }

  const p = protection;
  const refunded = Number(p.refundedTotal) || 0;
  const daysLeft = Math.max(0, Math.ceil((p.until - Date.now()) / 86_400_000));
  const simulate = async () => {
    setBusy("sim");
    setErr("");
    try {
      onUpdate((await protectionApi.simulate(p.id)).protection);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-inv-bg text-inv-fg">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{ar ? "حماية السعر" : "Price protection"}</div>
          <div className="truncate text-[11.5px] text-fg-muted">
            {p.status === "active"
              ? ar ? `شغّالة لحد ${date(p.until)} · باقي ${daysLeft} يوم` : `On until ${date(p.until)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
              : p.status === "expired"
                ? ar ? "انتهت مدة الحماية" : "Protection period ended"
                : p.message ?? (ar ? "الحماية خلصت" : "Protection ended")}
          </div>
        </div>
        {refunded > 0 && (
          <motion.span key={p.refundedTotal} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="rounded-full bg-inv-bg px-2.5 py-1 text-[11px] font-semibold text-inv-fg tabular-nums">
            +{m(refunded, p.charged.currency)}
          </motion.span>
        )}
      </div>

      <div className="space-y-2 border-t border-dashed border-line px-3 py-2.5">
        <div className="flex justify-between text-[12px]">
          <span className="text-fg-muted">{ar ? "دفعت" : "You paid"}</span>
          <span className="tabular-nums">{m(p.paidPrice, p.currency)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-fg-muted">{ar ? "السعر دلوقتي" : "Price now"}</span>
          <span className={`tabular-nums ${p.lastPrice != null && p.lastPrice < p.paidPrice ? "font-semibold" : ""}`}>
            {p.lastPrice != null ? m(p.lastPrice, p.currency) : "—"}
          </span>
        </div>
        <AnimatePresence initial={false}>
          {p.refunds.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-start gap-2 rounded-xl bg-bg-soft px-2.5 py-2 text-[11.5px]"
            >
              <TrendingDown className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {ar ? (
                    <>السعر نزل لـ {m(r.price, p.currency)} — رجّعتلك {m(Number(r.amount), r.currency)} على PayPal</>
                  ) : (
                    <>Price dropped to {m(r.price, p.currency)} — refunded {m(Number(r.amount), r.currency)} to your PayPal</>
                  )}
                </div>
                <div className="truncate font-mono text-[10px] text-fg-muted" dir="ltr">
                  {r.status} · {r.id}
                  {r.simulated ? " · simulated drop" : ""}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {p.status === "active" && (
          <p className="text-[11px] leading-snug text-fg-muted">
            {ar
              ? "دليل بيراجع السعر طول مدة الحماية. لو نزل، بيرجّعلك الفرق تلقائيًا كاسترداد جزئي من PayPal — من غير ما تطلب."
              : "Dalil keeps checking the price. If it drops, the difference comes back automatically as a partial PayPal refund — no claim needed."}
          </p>
        )}
        {err && <p className="text-[11.5px] text-danger">{err}</p>}
        {p.status === "active" && (
          <button
            onClick={simulate}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-[12px] font-medium hover:bg-bg-soft disabled:opacity-50"
          >
            {busy === "sim" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            {ar ? "جرّب نزول السعر (ساندبوكس)" : "Simulate price drop (sandbox)"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
