"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Package,
  Search,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Star,
  Truck,
  ScanSearch,
  Scale,
  AlertTriangle,
  Camera,
  Lock,
  ScanBarcode,
  MousePointerClick,
  AppWindow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney, type Strings } from "@/lib/i18n";
import type { Block, Lang, LinkPreview, Offer, Step } from "@/lib/types";

/* ---------- Image with graceful fallback ---------- */

export function SmartImage({
  src,
  alt,
  className,
  fallbackLabel,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-bg-muted text-fg-muted ${className ?? ""}`}>
        <div className="flex flex-col items-center gap-1">
          <Package className="size-6" strokeWidth={1.5} />
          {fallbackLabel && (
            <span className="max-w-[8rem] truncate text-[10px] uppercase tracking-wider">{fallbackLabel}</span>
          )}
        </div>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-contain bg-white ${className ?? ""}`}
    />
  );
}

/* ---------- Link preview ---------- */

export function LinkCard({ preview, lang }: { preview: LinkPreview; lang: Lang }) {
  let host = preview.site ?? "";
  try {
    host = new URL(preview.url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <motion.a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="group flex w-full max-w-md overflow-hidden rounded-2xl border border-line bg-bg shadow-card transition-colors hover:border-line-strong"
    >
      {preview.image && (
        <SmartImage src={preview.image} alt={preview.title ?? host} className="h-24 w-24 shrink-0 sm:h-28 sm:w-28" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <img
            src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
            alt=""
            className="size-3.5 rounded-sm"
            referrerPolicy="no-referrer"
          />
          <span className="truncate">{host}</span>
          <ExternalLink className="ms-auto size-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="line-clamp-2 text-sm font-medium leading-snug">{preview.title ?? preview.url}</div>
        {preview.price != null && preview.currency ? (
          <div className="text-sm font-semibold">{formatMoney(preview.price, preview.currency, lang)}</div>
        ) : preview.description ? (
          <div className="line-clamp-1 text-xs text-fg-muted">{preview.description}</div>
        ) : null}
      </div>
    </motion.a>
  );
}

/* ---------- Agent steps timeline ---------- */

const STEP_ICON: Record<string, typeof Search> = {
  web_search: Search,
  lookup_barcode: ScanBarcode,
  browse_url: Globe,
  browser_open: AppWindow,
  browser_action: MousePointerClick,
  show_offers: Scale,
  deal_check: ScanSearch,
  identify_image: Camera,
};

export function stepLabel(tool: string, s: Strings, lang: Lang): string {
  const ar: Record<string, string> = {
    web_search: "بيدوّر في المتاجر اللي بتقبل باي",
    search_salla: "بيدوّر في سلة شوب",
    lookup_barcode: "بيتعرف على المنتج من الباركود",
    browse_url: "بيتصفح",
    browser_open: "بيفتح الصفحة في متصفح حقيقي",
    browser_action: "بيتعامل مع الصفحة",
    show_offers: "بيقارن ويرتّب العروض",
    deal_check: "بيكشف العروض الوهمية",
    identify_image: "بيتعرف على المنتج من الصورة",
  };
  const en: Record<string, string> = {
    web_search: "Searching stores that accept Pi",
    search_salla: "Searching Salla Shop",
    lookup_barcode: "Identifying product from barcode",
    browse_url: "Browsing",
    browser_open: "Opening in a real browser",
    browser_action: "Interacting with the page",
    show_offers: "Comparing & ranking offers",
    deal_check: "Checking for fake deals",
    identify_image: "Identifying product from photo",
  };
  void s;
  return (lang === "ar" ? ar : en)[tool] ?? tool;
}

function Favicon({ host, className }: { host: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
      alt=""
      referrerPolicy="no-referrer"
      className={`rounded-full border-2 border-bg bg-bg-muted ${className ?? ""}`}
    />
  );
}

const TIP_ICONS = [Scale, ShieldCheck, ScanSearch, Globe, MapPin] as const;
const TIPS = {
  ar: [
    "دليل باي بيقارن السعر النهائي بالباي بعد الشحن",
    "إنت بتدفع للمتجر مباشرة — فلوسك مش بتعدي علينا",
    "بيكشف الخصومات الوهمية والمتاجر المشبوهة",
    "بيدوّر بس في المتاجر اللي بتبيع أو بتشحن لبلدك",
    "قول «قريب مني» علشان يدوّر في المحلات اللي حواليك",
  ],
  en: [
    "Dalil Pi compares the total price in Pi after shipping",
    "You pay the store directly — your Pi never passes through us",
    "It flags fake discounts and suspicious stores",
    "It only searches stores that sell or ship to your country",
    "Say “near me” to search physical shops around you",
  ],
};

function useClock(startedAt?: number, endedAt?: number, live?: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  if (!startedAt) return 0;
  return Math.max(0, Math.round(((endedAt ?? now) - startedAt) / 1000));
}

/** Searching indicator: CSS-only so React re-renders (timer, steps) never restart or stutter it. */
function RadarMark() {
  return (
    <span className="radar relative flex size-9 shrink-0 items-center justify-center" aria-hidden>
      <span className="radar-ring" />
      <span className="radar-ring" style={{ animationDelay: "-1.2s" }} />
      <span className="radar-sweep" />
      <span className="relative flex size-6 items-center justify-center rounded-full bg-inv-bg text-inv-fg">
        <svg viewBox="0 0 24 24" width={14} height={14} className="radar-needle">
          <path d="M12 3.5 L15 12 L12 10.6 L9 12 Z" fill="currentColor" />
          <path d="M12 20.5 L9 12 L12 13.4 L15 12 Z" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </span>
  );
}

/**
 * Live search experience. While running: radar, timer, 3-stage tracker, the
 * agent's current thought, discovered sites and rotating tips. When done it
 * collapses into a one-line summary (tap to see the plain-text steps).
 */
export function StepsTimeline({
  steps,
  live,
  s,
  lang,
  note,
  startedAt,
  endedAt,
}: {
  steps: Step[];
  live: boolean;
  s: Strings;
  lang: Lang;
  note?: string;
  startedAt?: number;
  endedAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const ar = lang === "ar";
  const running = live;
  const secs = useClock(startedAt, live ? undefined : endedAt, live);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTip((t) => t + 1), 4500);
    return () => clearInterval(id);
  }, [running]);

  const current = [...steps].reverse().find((x) => x.status === "running") ?? steps[steps.length - 1];
  const browsed = steps.filter((x) => (x.tool === "browse_url" || x.tool === "browser_open") && x.detail);
  const found = Array.from(new Set(steps.flatMap((x) => x.hosts ?? [])));
  const allHosts = Array.from(new Set([...browsed.map((x) => x.detail!), ...found]));
  const searches = steps.filter((x) => x.tool === "web_search" || x.tool === "search_salla").length;
  const sites = new Set(browsed.map((b) => b.detail)).size;
  const n = (v: number) => v.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US");
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  const stage = steps.some((x) => x.tool === "show_offers")
    ? 3
    : steps.some((x) => x.tool === "browse_url" || x.tool === "browser_open" || x.tool === "browser_action")
      ? 2
      : steps.length
        ? 1
        : 0;
  const stages = ar ? ["بحث", "تصفّح", "مقارنة"] : ["Search", "Browse", "Compare"];

  const summary = [
    searches ? (ar ? `بحث ${n(searches)} ${searches === 1 ? "مرة" : "مرات"}` : `${searches} search${searches > 1 ? "es" : ""}`) : null,
    sites ? (ar ? `تصفّح ${n(sites)} ${sites === 1 ? "موقع" : "مواقع"}` : `${sites} site${sites > 1 ? "s" : ""}`) : null,
    secs ? (ar ? `${n(secs)} ث` : `${secs}s`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (running) {
    const tips = TIPS[lang];
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-bg-soft"
      >
        <div className="flex items-center gap-3 px-3.5 pt-3.5">
          <RadarMark />
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current ? `${current.id}-${current.status}` : "start"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="shimmer truncate text-sm font-semibold"
                dir="auto"
              >
                {current
                  ? `${stepLabel(current.tool, s, lang)}${current.detail && (current.tool === "browse_url" || current.tool === "browser_open") ? ` ${current.detail}` : ""}`
                  : ar
                    ? "بيفهم طلبك…"
                    : "Understanding your request…"}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              {note && (
                <motion.p
                  key={note}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-muted"
                  dir="auto"
                >
                  {note}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 font-mono text-[11px] tabular-nums text-fg-muted" dir="ltr">
            {clock}
          </span>
        </div>

        {/* 3-stage tracker */}
        <div className="mt-3 flex items-center gap-1.5 px-3.5">
          {stages.map((label, i) => {
            const done = stage > i + 1;
            const active = stage === i + 1;
            return (
              <div key={label} className="flex flex-1 flex-col gap-1">
                <div className="relative h-1 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="absolute inset-y-0 rounded-full bg-fg ltr:left-0 rtl:right-0"
                    initial={{ width: 0 }}
                    animate={{ width: done ? "100%" : active ? ["15%", "85%", "15%"] : "0%" }}
                    transition={active ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.5 }}
                  />
                </div>
                <span className={`text-[10px] ${done || active ? "font-semibold text-fg" : "text-fg-muted"}`}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Discovered sites */}
        {allHosts.length > 0 && (
          <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto px-3.5">
            <AnimatePresence initial={false}>
              {allHosts.slice(-10).map((h) => {
                const st = browsed.filter((b) => b.detail === h).pop()?.status;
                return (
                  <motion.span
                    key={h}
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-bg py-1 ps-1 pe-2.5 text-[11px] ${
                      st === "error" ? "border-line text-fg-muted line-through" : "border-line"
                    }`}
                  >
                    <Favicon host={h} className="size-4 border-0" />
                    <span dir="ltr">{h}</span>
                    {st === "running" && <Loader2 className="size-3 animate-spin text-fg-muted" />}
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Rotating tips */}
        <div className="mt-3 border-t border-line px-3.5 py-2.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={tip % tips.length}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 text-[11.5px] text-fg-muted"
            >
              {(() => {
                const TipIcon = TIP_ICONS[tip % tips.length];
                return (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg">
                    <TipIcon className="size-3" />
                  </span>
                );
              })()}
              <span className="min-w-0">{tips[tip % tips.length]}</span>
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  if (!steps.length) return null;

  return (
    <div className="w-full max-w-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex max-w-full items-center gap-2.5 rounded-full border border-line bg-bg-soft py-1.5 ps-2 pe-3 text-[13px] transition-colors hover:border-line-strong"
      >
        <Check className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate text-fg-soft" dir="auto">
          {summary || (ar ? "خلص" : "Done")}
        </span>
        {allHosts.length > 0 && (
          <span className="flex shrink-0 items-center -space-x-1.5 rtl:space-x-reverse">
            {allHosts.slice(0, 4).map((h) => (
              <Favicon key={h} host={h} className="size-[18px]" />
            ))}
          </span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="shrink-0 text-[10px] text-fg-muted">
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 space-y-1 overflow-hidden ps-3 text-[12.5px]"
          >
            {note && (
              <li className="pb-1 text-fg-muted" dir="auto">
                “{note}”
              </li>
            )}
            {steps.map((st) => (
              <li key={st.id} className="flex min-w-0 items-center gap-2 text-fg-muted">
                {st.tool === "browse_url" && st.detail ? (
                  <Favicon host={st.detail} className="size-3.5 shrink-0 border-0" />
                ) : (
                  <span className={`size-1.5 shrink-0 rounded-full ${st.status === "error" ? "bg-danger" : "bg-fg-muted"}`} />
                )}
                <span className="shrink-0 text-fg-soft">{stepLabel(st.tool, s, lang)}</span>
                {st.detail && (
                  <span className="min-w-0 truncate" dir="auto">
                    {st.detail}
                  </span>
                )}
                {st.status === "error" && <span className="shrink-0 text-[11px]">{ar ? "محجوب" : "blocked"}</span>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Shimmering placeholder cards while offers are being found. */
export function OfferSkeletons() {
  return (
    <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full">
      <div className="no-scrollbar flex gap-3 overflow-hidden px-4 pb-2 pt-1 sm:px-0">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1 }}
            className="relative w-[15.5rem] shrink-0 overflow-hidden rounded-2xl border border-line bg-bg"
          >
            <div className="h-28 bg-bg-muted" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-1/3 rounded bg-bg-muted" />
              <div className="h-3 w-5/6 rounded bg-bg-muted" />
              <div className="h-5 w-1/2 rounded bg-bg-muted" />
              <div className="h-8 rounded-xl bg-bg-muted" />
            </div>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Live browser view ---------- */

const ACTION_LABEL: Record<string, { ar: string; en: string }> = {
  open: { ar: "فتح الصفحة", en: "Opened page" },
  click: { ar: "ضغط", en: "Clicked" },
  type: { ar: "كتب وبحث", en: "Typed & searched" },
  scroll: { ar: "نزل لتحت", en: "Scrolled" },
  back: { ar: "رجع", en: "Went back" },
};

export function BrowserCard({ block, lang, live }: { block: Extract<Block, { type: "browser" }>; lang: Lang; live: boolean }) {
  const ar = lang === "ar";
  let host = block.url;
  try {
    host = new URL(block.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  const act = ACTION_LABEL[block.action ?? "open"];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-bg shadow-card"
    >
      <div className="flex items-center gap-2 border-b border-line bg-bg-soft px-3 py-2" dir="ltr">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
        </span>
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-[11px] text-fg-soft hover:text-fg"
        >
          <Lock className="size-3 shrink-0" />
          <span className="truncate">{host}</span>
        </a>
        {live ? (
          <span className="flex items-center gap-1 rounded-full bg-inv-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-inv-fg">
            <span className="live-dot size-1.5 rounded-full bg-inv-fg" /> Live
          </span>
        ) : null}
      </div>
      <div className="relative aspect-[1280/860] w-full overflow-hidden bg-bg-muted">
        <AnimatePresence initial={false}>
          {block.shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <motion.img
              key={block.shot.length + (block.action ?? "") + block.url}
              src={block.shot}
              alt={block.title ?? host}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 size-full object-cover object-top"
            />
          ) : null}
        </AnimatePresence>
        {live ? <span className="browser-scan pointer-events-none absolute inset-x-0 top-0 h-16" /> : null}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-fg-muted" dir="auto">
        <AppWindow className="size-3.5 shrink-0" />
        <span className="truncate">
          {act ? (ar ? act.ar : act.en) : block.action}
          {block.title ? ` · ${block.title}` : ""}
        </span>
        {block.pages ? (
          <span className="ms-auto shrink-0 tabular-nums">
            {ar ? `${block.pages} ${block.pages === 1 ? "صفحة" : "صفحات"}` : `${block.pages} page${block.pages > 1 ? "s" : ""}`}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ---------- Product offers ---------- */

function TrustPill({ offer, s }: { offer: Offer; s: Strings }) {
  if (offer.trust === "verified")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-fg-soft">
        <ShieldCheck className="size-3" /> {s.verified}
      </span>
    );
  if (offer.trust === "suspicious")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
        <ShieldAlert className="size-3" /> {s.suspicious}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
      <Shield className="size-3" /> {s.unknownStore}
    </span>
  );
}

const FLAG_TEXT: Record<string, { ar: string; en: string }> = {
  price_far_below_market: { ar: "السعر أقل من السوق بشكل مريب", en: "Price suspiciously below market" },
  suspicious_discount: { ar: "خصم مبالغ فيه — غالبًا وهمي", en: "Inflated 'was' price — likely fake discount" },
  few_perfect_reviews: { ar: "تقييمات كاملة لكن قليلة جدًا", en: "Few, perfect reviews" },
  no_source_link: { ar: "مفيش لينك للمصدر", en: "No source link" },
  out_of_stock: { ar: "خلصان حاليًا", en: "Out of stock" },
  price_unverified: { ar: "السعر ده متأكدناش منه من صفحة المتجر", en: "Price not confirmed on the store page" },
  not_priced_in_pi: { ar: "السعر مش بالباي — اتأكد إن المتجر بيقبل باي", en: "Not priced in Pi — check the store accepts Pi" },
};

export function ProductCards({
  offers,
  s,
  lang,
  city,
  onOrder,
  ordersLeft,
}: {
  offers: Offer[];
  s: Strings;
  lang: Lang;
  city?: string;
  onOrder?: (o: Offer) => void;
  /** Orders left this month (null = unknown). */
  ordersLeft?: number | null;
}) {
  const badgeText: Record<string, string> = {
    cheapest: s.cheapest,
    topRated: s.topRated,
    bestValue: s.bestValue,
    nearest: s.nearest,
  };
  return (
    <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:px-0">
        {offers.map((o, i) => {
          const isTop = i === 0 && o.trust !== "suspicious";
          return (
            <motion.div
              key={o.id}
              data-offer-card={o.id}
              data-store={o.store}
              data-trust={o.trust}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
              className={`relative flex w-[15.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-bg shadow-card ${
                isTop ? "border-fg" : o.trust === "suspicious" ? "border-danger/40" : "border-line"
              }`}
            >
              <div className="relative">
                <SmartImage src={o.image} alt={o.title} fallbackLabel={o.store} className={o.image ? "h-36 w-full" : "h-24 w-full"} />
                <div className="absolute start-2 top-2 flex flex-wrap gap-1">
                  {o.badges.map((b) => (
                    <span
                      key={b}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        b === "bestValue" ? "bg-inv-bg text-inv-fg" : "border border-line bg-bg/90 text-fg backdrop-blur"
                      }`}
                    >
                      {badgeText[b] ?? b}
                    </span>
                  ))}
                </div>
                {o.score != null && (
                  <span className="absolute end-2 top-2 rounded-full bg-bg/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums backdrop-blur">
                    {o.score}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{o.store}</span>
                  <TrustPill offer={o} s={s} />
                </div>
                <div className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-fg-soft" dir="auto">
                  {o.title}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-lg font-semibold tabular-nums leading-tight" dir="ltr">
                      {formatMoney(o.total, o.currency, lang)}
                    </div>
                    {o.totalUsd != null && (
                      <div className="text-[11px] tabular-nums text-fg-muted" dir="ltr">
                        ≈ {formatMoney(o.totalUsd, "USD", lang)}
                      </div>
                    )}
                    <div className="text-[11px] text-fg-muted">
                      {s.shipping}:{" "}
                      {o.shipping ? formatMoney(o.shipping, o.currency, lang) : o.shipping === 0 ? s.free : "—"}
                    </div>
                  </div>
                  {o.rating != null && (
                    <div className="flex items-center gap-1 text-xs">
                      <Star className="size-3.5 fill-current" />
                      <span className="font-medium tabular-nums">{o.rating.toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                      {o.reviewCount != null && (
                        <span className="text-fg-muted">({o.reviewCount.toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US")})</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
                  {o.distanceKm != null && (
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(`${o.store} ${city ?? ""}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-2 hover:text-fg hover:underline"
                    >
                      <MapPin className="size-3" />
                      {o.distanceKm.toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US")} {s.km}
                      {o.pickup ? ` · ${s.pickup}` : ""}
                    </a>
                  )}
                  {o.deliveryDays != null && (
                    <span className="inline-flex items-center gap-1">
                      <Truck className="size-3" />
                      {o.deliveryDays.toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US")} {s.days}
                    </span>
                  )}
                </div>
                {o.flags.filter((f) => FLAG_TEXT[f] && f !== "no_source_link").length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {o.flags
                      .filter((f) => FLAG_TEXT[f] && f !== "no_source_link")
                      .map((f) => (
                        <div key={f} className="flex items-start gap-1 text-[11px] leading-snug text-danger">
                          <AlertTriangle className="mt-px size-3 shrink-0" />
                          {FLAG_TEXT[f][lang]}
                        </div>
                      ))}
                  </div>
                )}
                {o.reason && (
                  <div className="line-clamp-2 text-[11px] text-fg-muted" dir="auto">
                    {o.reason}
                  </div>
                )}
                {o.piEvidence && (
                  <div className="line-clamp-2 text-[11px] text-fg-muted" dir="auto" title={o.piEvidence}>
                    π {o.piEvidence}
                  </div>
                )}
                <div className="mt-auto flex flex-col gap-1.5 pt-2">
                  {(() => {
                    const orderable = !!(onOrder && o.url && o.sig && o.trust !== "suspicious" && !o.flags.includes("price_unverified") && !o.flags.includes("not_priced_in_pi"));
                    if (orderable) {
                      const out = ordersLeft != null && ordersLeft <= 0;
                      return (
                        <>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            disabled={out}
                            onClick={() => onOrder!(o)}
                            title={s.payInStore}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2 text-xs font-semibold text-inv-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            <Package className="size-3.5" /> {s.order} <ExternalLink className="size-3" />
                          </motion.button>
                          {out && <span className="text-center text-[10.5px] text-danger">{s.noOrdersLeft}</span>}
                        </>
                      );
                    }
                    return o.url ? (
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-1 rounded-xl border border-line py-2 text-xs font-medium text-fg-soft hover:bg-bg-soft"
                      >
                        {s.view} <ExternalLink className="size-3" />
                      </a>
                    ) : null;
                  })()}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
