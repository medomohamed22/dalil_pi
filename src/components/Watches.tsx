"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellRing,
  Check,
  Clock,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  Trash2,
  X,
  Zap,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/i18n";
import type { Lang, Offer, PricePoint, Watch, WatchMode } from "@/lib/types";
import { SmartImage } from "./cards";

/* ---------------- Sparkline ---------------- */

export function Sparkline({ points, target, className }: { points: PricePoint[]; target?: number; className?: string }) {
  const w = 160;
  const h = 40;
  const ps = points.length === 1 ? [points[0], { ...points[0], t: points[0].t + 1 }] : points;
  if (!ps.length) return null;
  const vals = ps.map((p) => p.price).concat(target != null ? [target] : []);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (ps.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 4 - ((v - min) / span) * (h - 8);
  const d = ps.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const last = ps[ps.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      {target != null && (
        <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" strokeWidth={1} />
      )}
      <motion.path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      <circle cx={x(ps.length - 1)} cy={y(last.price)} r={2.5} fill="currentColor" />
    </svg>
  );
}

/* ---------------- Toasts ---------------- */

export interface Toast {
  id: string;
  title: string;
  body?: string;
  image?: string;
  /** Icon shown in the toast (as a badge on the image when there is one). */
  icon?: LucideIcon;
  action?: { label: string; run: () => void };
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-bg/95 p-2.5 pe-3 shadow-card backdrop-blur"
          >
            {t.image ? (
              <div className="relative shrink-0">
                <SmartImage src={t.image} alt="" className="size-11 rounded-xl" />
                {t.icon && (
                  <span className="absolute -bottom-1 -end-1 flex size-5 items-center justify-center rounded-full border-2 border-bg bg-inv-bg text-inv-fg">
                    <t.icon className="size-2.5" strokeWidth={2.5} />
                  </span>
                )}
              </div>
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-inv-bg text-inv-fg">
                {t.icon ? <t.icon className="size-5" /> : <BellRing className="size-5" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" dir="auto">
                {t.title}
              </div>
              {t.body && (
                <div className="line-clamp-2 text-xs text-fg-muted" dir="auto">
                  {t.body}
                </div>
              )}
            </div>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  onDismiss(t.id);
                }}
                className="shrink-0 rounded-xl bg-inv-bg px-3 py-2 text-xs font-semibold text-inv-fg"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => onDismiss(t.id)} className="shrink-0 rounded-full p-1 text-fg-muted hover:text-fg" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Create watch sheet ---------------- */

export function WatchSheet({
  offer,
  lang,
  defaultMaxSpend,
  vaultConnected,
  initialTarget,
  initialMode,
  onConnectVault,
  onCreate,
  onClose,
}: {
  offer: Offer | null;
  lang: Lang;
  defaultMaxSpend: number;
  vaultConnected: boolean;
  initialTarget?: number;
  initialMode?: WatchMode;
  onConnectVault: () => Promise<void>;
  onCreate: (p: { targetPrice: number; mode: WatchMode; maxSpend: number; notifications: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const ar = lang === "ar";
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<WatchMode>("notify");
  const [maxSpend, setMaxSpend] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!offer) return;
    const t = initialTarget ?? Math.floor(offer.price * 0.95);
    setTarget(String(t));
    setMode(initialMode ?? "notify");
    setMaxSpend(String(defaultMaxSpend || Math.ceil((t + (offer.shipping ?? 0)) * 1.02)));
    setErr(null);
    setBusy(false);
  }, [offer, initialTarget, initialMode, defaultMaxSpend]);

  const field = "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition-colors focus:border-fg tabular-nums";
  const tNum = Number(target);
  const pct = offer && tNum > 0 ? Math.round((1 - tNum / offer.price) * 100) : 0;

  return (
    <AnimatePresence>
      {offer && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={ar ? "مراقبة السعر" : "Watch price"}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-bg pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:start-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-y-1/2 sm:rounded-3xl sm:border rtl:sm:translate-x-1/2 ltr:sm:-translate-x-1/2"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Bell className="size-4" /> {ar ? "راقب السعر" : "Watch price"}
              </h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                <SmartImage src={offer.image} alt="" fallbackLabel={offer.store} className="size-14 shrink-0 rounded-xl" />
                <div className="min-w-0">
                  <div className="text-[11px] text-fg-muted">{offer.store}</div>
                  <div className="line-clamp-2 text-sm font-medium leading-snug" dir="auto">
                    {offer.title}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {ar ? "السعر الحالي" : "Now"}: <span className="font-semibold text-fg">{formatMoney(offer.price, offer.currency, lang)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-fg-muted">
                  <span>
                    {ar ? "السعر المستهدف" : "Target price"} ({offer.currency})
                  </span>
                  {pct > 0 && <span className="inline-flex items-center gap-1 text-fg"><TrendingDown className="size-3" /> -{pct}%</span>}
                </label>
                <input dir="ltr" inputMode="decimal" type="number" min={1} className={field} value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-fg-muted">{ar ? "لما السعر يوصل" : "When the price hits it"}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["notify", "auto"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-2xl border p-3 text-start transition-all ${mode === m ? "border-fg bg-bg-soft" : "border-line hover:border-line-strong"}`}
                    >
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {m === "notify" ? <BellRing className="size-4" /> : <Zap className="size-4" />}
                        {m === "notify" ? (ar ? "بلّغني" : "Notify me") : ar ? "اشتري تلقائي" : "Auto-buy"}
                      </div>
                      <div className="mt-1 text-[11px] leading-snug text-fg-muted">
                        {m === "notify"
                          ? ar
                            ? "إشعار وبعدين توافق وتدفع"
                            : "Alert, then you approve"
                          : ar
                            ? "يحجز المبلغ ومعاك ١٠ دقايق تلغي"
                            : "Holds funds, 10 min to cancel"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {mode === "auto" && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-fg-muted">
                        {ar ? "أقصى إجمالي يدفعه (Mandate)" : "Max total it may pay (mandate)"} ({offer.currency})
                      </label>
                      <input dir="ltr" inputMode="decimal" type="number" min={0} className={field} value={maxSpend} onChange={(e) => setMaxSpend(e.target.value)} />
                    </div>
                    {vaultConnected ? (
                      <div className="flex items-center gap-2 rounded-xl bg-bg-soft px-3 py-2.5 text-xs">
                        <Check className="size-3.5" /> {ar ? "PayPal متوصّل للشراء التلقائي" : "PayPal connected for auto-buy"}
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          setConnecting(true);
                          setErr(null);
                          try {
                            await onConnectVault();
                          } catch (e) {
                            setErr((e as Error).message);
                          } finally {
                            setConnecting(false);
                          }
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-fg py-2.5 text-xs font-semibold"
                      >
                        {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                        {ar ? "وصّل PayPal للشراء التلقائي" : "Connect PayPal for auto-buy"}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                <span className="text-sm">{ar ? "ابعتلي إشعار على الجهاز" : "Send me notifications"}</span>
                <input type="checkbox" className="size-4 accent-current" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
              </label>

              {err && <p className="text-xs text-danger">{err}</p>}

              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={busy || !(tNum > 0) || (mode === "auto" && !vaultConnected)}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await onCreate({ targetPrice: tNum, mode, maxSpend: Number(maxSpend) || 0, notifications });
                  } catch (e) {
                    setErr((e as Error).message);
                    setBusy(false);
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg disabled:opacity-40"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {ar ? "ابدأ المراقبة" : "Start watching"}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Watches panel ---------------- */

function useTick(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [on]);
}

const STATUS: Record<Watch["status"], { ar: string; en: string }> = {
  active: { ar: "بيراقب", en: "Watching" },
  triggered: { ar: "السعر نزل!", en: "Price dropped!" },
  held: { ar: "اتشترى — المبلغ محجوز", en: "Bought — funds held" },
  bought: { ar: "تم الشراء", en: "Purchased" },
  cancelled: { ar: "اتلغى", en: "Cancelled" },
  error: { ar: "خطأ", en: "Error" },
};

export function WatchCard({
  w,
  lang,
  demo,
  onAction,
  onBuy,
  onDelete,
}: {
  w: Watch;
  lang: Lang;
  demo: boolean;
  onAction: (id: string, a: "simulate" | "check" | "cancel" | "capture" | "reactivate") => Promise<void>;
  onBuy: (w: Watch) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const ar = lang === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  useTick(w.status === "held");
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const left = w.hold ? Math.max(0, w.hold.captureAt - Date.now()) : 0;
  const clock = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const hit = w.lastPrice != null && w.lastPrice <= w.targetPrice;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} className="overflow-hidden rounded-2xl border border-line bg-bg shadow-card">
      <div className="flex gap-3 p-3">
        <SmartImage src={w.image} alt="" fallbackLabel={w.store} className="size-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-fg-muted">{w.store}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                w.status === "triggered" || w.status === "held" || w.status === "bought" ? "bg-inv-bg text-inv-fg" : "border border-line"
              } ${w.status === "error" ? "text-danger" : ""}`}
            >
              <span className="inline-flex items-center gap-1">
                {w.mode === "auto" && <Zap className="size-2.5 fill-current" />}
                {STATUS[w.status][lang]}
              </span>
            </span>
          </div>
          <div className="line-clamp-1 text-sm font-medium" dir="auto">
            {w.title}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 text-xs tabular-nums">
            <span className={`text-sm font-semibold ${hit ? "" : ""}`}>{w.lastPrice != null ? formatMoney(w.lastPrice, w.currency, lang) : "—"}</span>
            <span className="text-fg-muted">
              {ar ? "الهدف" : "target"} {formatMoney(w.targetPrice, w.currency, lang)}
            </span>
          </div>
        </div>
      </div>
      <div className="px-3">
        <Sparkline points={w.history} target={w.targetPrice} className="h-10 w-full text-fg" />
      </div>
      {w.message && (
        <p className="px-3 pt-1 text-[11px] text-fg-muted" dir="auto">
          {w.message}
        </p>
      )}

      {w.status === "held" && w.hold && (
        <div className="mx-3 mt-2 space-y-1 rounded-xl bg-bg-soft p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" /> {w.hold.amount} {w.hold.currency}
            </span>
            <span className="inline-flex items-center gap-1 font-mono font-semibold" dir="ltr">
              <Clock className="size-3" /> {clock}
            </span>
          </div>
          {w.hold.shipping?.address && (
            <div className="truncate text-[11px] text-fg-muted" dir="auto">
              {w.hold.shipping.name} · {w.hold.shipping.address}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 p-3">
        {w.status === "triggered" && w.triggeredOffer && (
          <button onClick={() => onBuy(w)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-inv-bg px-3 py-2 text-xs font-semibold text-inv-fg">
            <ShoppingBag className="size-3.5" /> {ar ? "اشتري دلوقتي" : "Buy now"}
          </button>
        )}
        {w.status === "held" && (
          <>
            <button
              onClick={() => run("cancel", () => onAction(w.id, "cancel"))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-fg px-3 py-2 text-xs font-semibold"
            >
              {busy === "cancel" && <Loader2 className="size-3 animate-spin" />}
              {ar ? "إلغاء وفك الحجز" : "Cancel & release"}
            </button>
            <button
              onClick={() => run("capture", () => onAction(w.id, "capture"))}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-inv-bg px-3 py-2 text-xs font-semibold text-inv-fg"
            >
              {busy === "capture" && <Loader2 className="size-3 animate-spin" />}
              {ar ? "تأكيد الآن" : "Confirm now"}
            </button>
          </>
        )}
        {w.status === "active" && demo && (
          <button
            onClick={() => run("simulate", () => onAction(w.id, "simulate"))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs font-medium"
          >
            {busy === "simulate" ? <Loader2 className="size-3 animate-spin" /> : <TrendingDown className="size-3.5" />}
            {ar ? "محاكاة نزول السعر" : "Simulate price drop"}
          </button>
        )}
        {w.status === "active" && (
          <button onClick={() => run("check", () => onAction(w.id, "check"))} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium">
            <RefreshCw className={`size-3.5 ${busy === "check" ? "animate-spin" : ""}`} />
            {ar ? "افحص الآن" : "Check now"}
          </button>
        )}
        {(w.status === "triggered" || w.status === "cancelled" || w.status === "error") && (
          <button onClick={() => run("re", () => onAction(w.id, "reactivate"))} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium">
            <Bell className="size-3.5" /> {ar ? "كمّل مراقبة" : "Keep watching"}
          </button>
        )}
        <button
          onClick={() => run("del", () => onDelete(w.id))}
          className="ms-auto inline-flex items-center rounded-xl px-2 py-2 text-fg-muted hover:text-fg"
          aria-label={ar ? "حذف" : "Delete"}
        >
          {busy === "del" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}

export function WatchesPanel({
  open,
  watches,
  lang,
  demo,
  persistent,
  vaultConnected,
  onClose,
  onAction,
  onBuy,
  onDelete,
  onDisconnectVault,
}: {
  open: boolean;
  watches: Watch[];
  lang: Lang;
  demo: boolean;
  persistent: boolean | null;
  vaultConnected: boolean;
  onClose: () => void;
  onAction: (id: string, a: "simulate" | "check" | "cancel" | "capture" | "reactivate") => Promise<void>;
  onBuy: (w: Watch) => void;
  onDelete: (id: string) => Promise<void>;
  onDisconnectVault: () => Promise<void>;
}) {
  const ar = lang === "ar";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-label={ar ? "مراقبة الأسعار" : "Price watches"}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:bottom-auto sm:end-0 sm:start-auto sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-s sm:border-t-0"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Bell className="size-4" /> {ar ? "مراقبة الأسعار" : "Price watches"}
                <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] tabular-nums">{watches.length}</span>
              </h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            {persistent === false && (
              <p className="mx-5 mb-2 flex items-start gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2 text-[11px] leading-snug text-fg-muted">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                {ar
                  ? "التخزين مؤقت على السيرفر (Upstash Redis مش متظبط) — المراقبات ممكن تتمسح."
                  : "Server storage is temporary (Upstash Redis not configured) — watches may be lost."}
              </p>
            )}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-5">
              {watches.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-fg-muted">
                  <Bell className="size-8" strokeWidth={1.25} />
                  <span className="inline-flex flex-wrap items-center justify-center gap-1">
                    {ar ? "مفيش مراقبات لسه. دوس" : "No watches yet. Tap"}
                    <span className="inline-flex size-5 items-center justify-center rounded-full border border-line text-fg">
                      <Bell className="size-3" />
                    </span>
                    {ar ? "على أي منتج." : "on any product."}
                  </span>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {watches.map((w) => (
                    <WatchCard key={w.id} w={w} lang={lang} demo={demo || w.source === "demo"} onAction={onAction} onBuy={onBuy} onDelete={onDelete} />
                  ))}
                </AnimatePresence>
              )}
            </div>
            {vaultConnected && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5" /> {ar ? "PayPal متوصّل للشراء التلقائي" : "PayPal connected for auto-buy"}
                </span>
                <button onClick={onDisconnectVault} className="text-fg-muted underline underline-offset-2">
                  {ar ? "افصل" : "Disconnect"}
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function WatchDraftCard({ offer, targetPrice, mode, lang, onOpen }: { offer: Offer; targetPrice?: number; mode?: WatchMode; lang: Lang; onOpen: () => void }) {
  const ar = lang === "ar";
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-bg p-3 shadow-card">
      <SmartImage src={offer.image} alt="" fallbackLabel={offer.store} className="size-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium" dir="auto">
          {offer.title}
        </div>
        <div className="flex items-center gap-1 text-xs text-fg-muted">
          {mode === "auto" ? <Zap className="size-3 fill-current" /> : <Bell className="size-3" />}
          {ar ? "الهدف" : "Target"}: {targetPrice ? formatMoney(targetPrice, offer.currency, lang) : "—"}
        </div>
      </div>
      <button onClick={onOpen} className="shrink-0 rounded-xl bg-inv-bg px-3 py-2 text-xs font-semibold text-inv-fg">
        {ar ? "ظبّط المراقبة" : "Set up"}
      </button>
    </motion.div>
  );
}
