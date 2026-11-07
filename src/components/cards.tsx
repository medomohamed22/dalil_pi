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
  X,
  ScanSearch,
  Scale,
  AlertTriangle,
  Camera,
  Clock,
  RotateCcw,
  Lock,
  BellPlus,
  PackageSearch,
  ScanBarcode,
  ShoppingCart,
  MousePointerClick,
  Handshake,
  AppWindow,
  ArrowRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney, type Strings } from "@/lib/i18n";
import PayLaterMessage from "./PayLater";
import { NegotiationPanel } from "./Negotiation";
import { TrustReceipt } from "./Receipt";
import { GroupMini, GroupStarter } from "./Group";
import { FamilyMini, FamilyStarter } from "./Family";
import { PriceProtectionPanel } from "./Protection";
import type { ApprovalStatus, Block, Lang, LinkPreview, Negotiation, Offer, Protection, PurchaseContext, Step } from "@/lib/types";

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
  catalog_search: PackageSearch,
  browse_url: Globe,
  browser_open: AppWindow,
  browser_action: MousePointerClick,
  show_offers: Scale,
  request_purchase_approval: ShieldCheck,
  deal_check: ScanSearch,
  identify_image: Camera,
};

export function stepLabel(tool: string, s: Strings, lang: Lang): string {
  const ar: Record<string, string> = {
    web_search: "بيبحث في الويب",
    lookup_barcode: "بيتعرف على المنتج من الباركود",
    catalog_search: "بيدوّر في كتالوج ١٠٠ مليون منتج",
    browse_url: "بيتصفح",
    browser_open: "بيفتح الصفحة في متصفح حقيقي",
    browser_action: "بيتعامل مع الصفحة",
    show_offers: "بيقارن ويرتّب العروض",
    request_purchase_approval: "بيجهّز طلب الموافقة",
    deal_check: "بيكشف العروض الوهمية",
    identify_image: "بيتعرف على المنتج من الصورة",
  };
  const en: Record<string, string> = {
    web_search: "Searching the web",
    lookup_barcode: "Identifying product from barcode",
    catalog_search: "Searching a 100M-product catalog",
    browse_url: "Browsing",
    browser_open: "Opening in a real browser",
    browser_action: "Interacting with the page",
    show_offers: "Comparing & ranking offers",
    request_purchase_approval: "Preparing approval",
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

const TIP_ICONS = [Scale, ShieldCheck, ScanSearch, BellPlus, MapPin] as const;
const TIPS = {
  ar: [
    "دليل بيقارن السعر النهائي بعد الشحن، مش سعر الرف بس",
    "مفيش جنيه بيتخصم من غير موافقتك — والمبلغ بيتحجز الأول",
    "بيكشف الخصومات الوهمية والمتاجر المشبوهة",
    "تقدر تقوله «راقب السعر» ويبلغك أول ما ينزل",
    "بيحسب المسافة لأقرب محل لو حابب تستلم بنفسك",
  ],
  en: [
    "Dalil compares the total cost after shipping, not just the sticker price",
    "Nothing is charged without your approval — funds are held first",
    "It flags fake discounts and suspicious stores",
    "Say “watch the price” and it alerts you when it drops",
    "It measures the distance to the nearest store for pickup",
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
  const searches = steps.filter((x) => x.tool === "web_search" || x.tool === "catalog_search").length;
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
};

export function ProductCards({
  offers,
  s,
  lang,
  onBuy,
  onWatch,
  onAddToCart,
  inCart,
  disabled,
  city,
}: {
  offers: Offer[];
  s: Strings;
  lang: Lang;
  onBuy?: (o: Offer) => void;
  onWatch?: (o: Offer) => void;
  onAddToCart?: (o: Offer) => void;
  inCart?: (o: Offer) => boolean;
  disabled?: boolean;
  city?: string;
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
                    <div className="text-lg font-semibold tabular-nums leading-tight">
                      {formatMoney(o.total, o.currency, lang)}
                    </div>
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
                <div className="mt-auto flex gap-2 pt-2">
                  {o.url && (
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line py-2 text-xs font-medium transition-colors hover:bg-bg-soft"
                    >
                      {s.view} <ExternalLink className="size-3" />
                    </a>
                  )}
                  {onWatch && o.trust !== "suspicious" && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onWatch(o)}
                      title={lang === "ar" ? "راقب السعر" : "Watch price"}
                      aria-label={lang === "ar" ? "راقب السعر" : "Watch price"}
                      className="flex shrink-0 items-center justify-center rounded-xl border border-line px-2.5 transition-colors hover:bg-bg-soft"
                    >
                      <BellPlus className="size-3.5" />
                    </motion.button>
                  )}
                  {onAddToCart && o.trust !== "suspicious" && !o.flags.includes("price_unverified") && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onAddToCart(o)}
                      title={inCart?.(o) ? (lang === "ar" ? "في السلة" : "In cart") : lang === "ar" ? "ضيف للسلة" : "Add to cart"}
                      aria-label={inCart?.(o) ? (lang === "ar" ? "في السلة" : "In cart") : lang === "ar" ? "ضيف للسلة" : "Add to cart"}
                      aria-pressed={inCart?.(o) ?? false}
                      className={`flex shrink-0 items-center justify-center rounded-xl border px-2.5 transition-colors ${
                        inCart?.(o) ? "border-fg bg-inv-bg text-inv-fg" : "border-line hover:bg-bg-soft"
                      }`}
                    >
                      {inCart?.(o) ? <Check className="size-3.5" /> : <ShoppingCart className="size-3.5" />}
                    </motion.button>
                  )}
                  {onBuy && o.trust !== "suspicious" && (
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      disabled={disabled}
                      onClick={() => onBuy(o)}
                      className="flex-1 rounded-xl bg-inv-bg py-2 text-xs font-semibold text-inv-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {s.buy}
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Purchase approval ---------- */

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function HoldCountdown({ until, lang, total }: { until: number; lang: Lang; total: number }) {
  const now = useNow(true);
  const left = Math.max(0, until - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const clock = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <Clock className="size-3.5" />
          {lang === "ar" ? "هيتخصم تلقائيًا بعد" : "Auto-charges in"}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums" dir="ltr">
          {clock}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg-muted">
        <motion.div className="h-full rounded-full bg-fg" animate={{ width: `${pct}%` }} transition={{ ease: "linear", duration: 1 }} />
      </div>
    </div>
  );
}

/* ---------- After the purchase: tracking & problems ---------- */

type Reason = "not_received" | "damaged" | "not_as_described";

function AfterCare({
  lang,
  tracking,
  refund,
  onTrack,
  onRefund,
}: {
  lang: Lang;
  tracking?: { trackingNumber: string; carrier: string; addedAt: number };
  refund?: { id: string; status: string; reason: string; amount?: string; currency?: string };
  onTrack?: () => Promise<void>;
  onRefund?: (r: Reason) => Promise<void>;
}) {
  const ar = lang === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const now = useNow(!!tracking && !refund);
  const run = async (k: string, fn?: () => Promise<void>) => {
    if (!fn) return;
    setBusy(k);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  if (refund) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-bg-soft p-3 text-xs">
        <div className="flex items-center gap-1.5 font-semibold">
          <RotateCcw className="size-3.5" /> {ar ? "اترجّعلك المبلغ عن طريق PayPal" : "Refunded via PayPal"}
        </div>
        <div className="mt-1 text-fg-muted" dir="ltr">
          {refund.amount ? `${refund.amount} ${refund.currency} · ` : ""}
          {refund.status} · {refund.id}
        </div>
      </motion.div>
    );
  }

  // Demo shipment timeline (sandbox: Dalil is the merchant of record).
  const stages = ar ? ["اتدفع", "اتشحن", "في الطريق", "اتسلّم"] : ["Paid", "Shipped", "In transit", "Delivered"];
  const elapsed = tracking ? now - tracking.addedAt : -1;
  const reached = !tracking ? 1 : elapsed > 120_000 ? 4 : elapsed > 30_000 ? 3 : 2;

  return (
    <div className="space-y-2.5">
      {tracking && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden rounded-2xl border border-line p-3">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold">{tracking.carrier}</span>
            <span className="font-mono text-fg-muted" dir="ltr">
              {tracking.trackingNumber}
            </span>
          </div>
          <div className="relative flex justify-between">
            <div className="absolute inset-x-2 top-[5px] h-[2px] bg-line" />
            <motion.div
              className="absolute top-[5px] h-[2px] bg-fg ltr:left-2 rtl:right-2"
              initial={{ width: 0 }}
              animate={{ width: `calc(${((reached - 1) / (stages.length - 1)) * 100}% - 1rem)` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
            {stages.map((st, i) => (
              <div key={st} className="relative z-10 flex flex-col items-center gap-1.5">
                <motion.span
                  animate={{ scale: i + 1 === reached ? [1, 1.25, 1] : 1 }}
                  transition={{ repeat: i + 1 === reached && reached < 4 ? Infinity : 0, duration: 1.6 }}
                  className={`size-3 rounded-full border-2 ${i < reached ? "border-fg bg-fg" : "border-line-strong bg-bg"}`}
                />
                <span className={`text-[10px] ${i < reached ? "font-semibold" : "text-fg-muted"}`}>{st}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-fg-muted">
            {ar ? "رقم التتبع اتسجّل على الأوردر في PayPal · خط سير تجريبي" : "Tracking added to the PayPal order · demo timeline"}
          </p>
        </motion.div>
      )}
      <div className="flex gap-2">
        {!tracking && onTrack && (
          <button
            onClick={() => run("track", onTrack)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line py-2.5 text-xs font-semibold hover:bg-bg-soft"
          >
            {busy === "track" ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
            {ar ? "تتبّع الطلب" : "Track order"}
          </button>
        )}
        {onRefund && !asking && (
          <button
            onClick={() => setAsking(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line py-2.5 text-xs font-medium text-fg-soft hover:bg-bg-soft"
          >
            {ar ? "مشكلة في الطلب؟" : "Problem with order?"}
          </button>
        )}
      </div>
      <AnimatePresence>
        {asking && onRefund && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
            {(
              [
                ["not_received", ar ? "الطلب ماوصلش" : "It didn't arrive"],
                ["damaged", ar ? "وصل بايظ" : "It arrived damaged"],
                ["not_as_described", ar ? "مش زي الوصف" : "Not as described"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => run(k, () => onRefund(k))}
                className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-xs hover:border-fg"
              >
                {label}
                {busy === k ? <Loader2 className="size-3.5 animate-spin" /> : <span className="inline-flex items-center gap-1 text-fg-muted">
                    {ar ? "استرجاع" : "Refund"}
                    <ArrowRight className="size-3 rtl:-scale-x-100" />
                  </span>}
              </button>
            ))}
            <button onClick={() => setAsking(false)} className="w-full py-1 text-[11px] text-fg-muted underline">
              {ar ? "رجوع" : "Back"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ApprovalCard({
  offer,
  status,
  message,
  holdExpiresAt,
  shipping,
  payerEmail,
  s,
  lang,
  onApprove,
  onDecline,
  onCancelHold,
  onCaptureNow,
  onRetry,
  tracking,
  refund,
  onTrack,
  onRefund,
  negotiation,
  onNegotiate,
  context,
  mandate,
  orderId,
  captureId,
  groupId,
  onGroup,
  protection,
  captureToken,
  familyId,
  suggest,
  demo,
  onPatch,
}: {
  groupId?: string;
  onGroup?: (shares: number) => Promise<void>;
  protection?: Protection;
  captureToken?: string;
  familyId?: string;
  suggest?: "family";
  demo?: boolean;
  /** Persist a change to this approval block (protection state, family request id). */
  onPatch?: (patch: { protection?: Protection; familyId?: string }) => Promise<void> | void;
  context?: PurchaseContext;
  mandate?: { maxSpend: number; verifiedOnly: boolean };
  orderId?: string;
  captureId?: string;
  negotiation?: Negotiation;
  onNegotiate?: () => void;
  offer: Offer;
  status: ApprovalStatus;
  message?: string;
  holdExpiresAt?: number;
  shipping?: { name?: string; address?: string };
  payerEmail?: string;
  s: Strings;
  lang: Lang;
  onApprove: () => void;
  onDecline: () => void;
  onCancelHold?: () => void;
  onCaptureNow?: () => void;
  onRetry?: () => void;
  tracking?: { trackingNumber: string; carrier: string; addedAt: number };
  refund?: { id: string; status: string; reason: string; amount?: string; currency?: string };
  onTrack?: () => Promise<void>;
  onRefund?: (r: "not_received" | "damaged" | "not_as_described") => Promise<void>;
}) {
  const statusLine: Partial<Record<ApprovalStatus, string>> = {
    processing: s.processing,
    held: s.held,
    captured: s.captured,
    voided: s.voided,
    declined: s.declined,
  };
  const converted = offer.chargeCurrency && offer.chargeCurrency !== offer.currency && offer.chargeAmount != null;
  return (
    <motion.div
      data-approval-card={offer.id}
      data-status={status}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-bg shadow-card"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4" />
          {s.approveTitle}
        </div>
        <TrustPill offer={offer} s={s} />
      </div>
      <div className="relative">
        <SmartImage src={offer.image} alt={offer.title} fallbackLabel={offer.store} className="h-48 w-full" />
        <AnimatePresence>
          {(status === "held" || status === "captured") && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-inv-bg px-2.5 py-1 text-[11px] font-semibold text-inv-fg"
            >
              {status === "held" ? <Lock className="size-3" /> : <Check className="size-3" />}
              {status === "held" ? s.held : s.captured}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <div className="text-xs text-fg-muted">{offer.store}</div>
          <div className="text-[15px] font-medium leading-snug" dir="auto">
            {offer.title}
          </div>
        </div>
        <dl className="space-y-1.5 rounded-2xl bg-bg-soft p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">{s.item}</dt>
            <dd className="tabular-nums">{formatMoney(offer.price, offer.currency, lang)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">{s.shipping}</dt>
            <dd className="tabular-nums">
              {offer.shipping ? formatMoney(offer.shipping, offer.currency, lang) : s.free}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
            <dt>{s.total}</dt>
            <dd className="flex items-baseline gap-2 tabular-nums">
              {negotiation && negotiation.original.total > offer.total ? (
                <span className="text-xs font-normal text-fg-muted line-through">{formatMoney(negotiation.original.total, offer.currency, lang)}</span>
              ) : null}
              <motion.span key={offer.total} initial={{ scale: 1.15 }} animate={{ scale: 1 }}>
                {formatMoney(offer.total, offer.currency, lang)}
              </motion.span>
            </dd>
          </div>
          {converted && (
            <div className="flex justify-between text-xs text-fg-muted">
              <dt>{lang === "ar" ? "المبلغ في PayPal" : "Charged via PayPal"}</dt>
              <dd className="tabular-nums" dir="ltr">
                {formatMoney(offer.chargeAmount!, offer.chargeCurrency!, "en")}
                {offer.fxRate ? ` · 1 USD = ${offer.fxRate} ${offer.currency}` : ""}
              </dd>
            </div>
          )}
        </dl>
        <div className="flex items-start gap-1.5 text-xs text-fg-muted">
          <Truck className="mt-px size-3.5 shrink-0" />
          {shipping?.address ? (
            <span dir="auto">
              <span className="font-medium text-fg-soft">{shipping.name}</span>
              {shipping.name ? " · " : ""}
              {shipping.address}
            </span>
          ) : (
            s.shipTo
          )}
        </div>
        {payerEmail && (
          <div className="truncate text-[11px] text-fg-muted" dir="ltr">
            PayPal · {payerEmail}
          </div>
        )}

        {negotiation && <NegotiationPanel neg={negotiation} offer={offer} lang={lang} />}

        <AnimatePresence mode="wait">
          {status === "pending" ? (
            <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {onNegotiate && !groupId && offer.trust !== "suspicious" && (!negotiation || negotiation.status === "failed") && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onNegotiate}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-2.5 text-sm font-medium transition-colors hover:bg-bg-soft"
                >
                  <Handshake className="size-4" />
                  {lang === "ar" ? "خلّي دليل يفاوض على سعر أحسن" : "Let Dalil negotiate a better price"}
                </motion.button>
              )}
              {groupId ? (
                <GroupMini id={groupId} lang={lang} />
              ) : familyId ? null : onGroup && offer.trust !== "suspicious" && negotiation?.status !== "running" ? (
                <GroupStarter lang={lang} onCreate={onGroup} />
              ) : null}
              {familyId ? (
                <FamilyMini id={familyId} lang={lang} />
              ) : !groupId && onPatch && offer.trust !== "suspicious" && negotiation?.status !== "running" ? (
                <FamilyStarter lang={lang} offer={offer} initialOpen={suggest === "family"} onCreated={(id) => onPatch({ familyId: id })} />
              ) : null}
              {!groupId && !familyId && (
                <PayLaterMessage
                  amount={offer.chargeAmount ?? offer.total}
                  currency={offer.chargeCurrency ?? offer.currency}
                  lang={lang}
                />
              )}
              {!groupId && !familyId && (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                onClick={onApprove}
                disabled={negotiation?.status === "running"}
                className="relative w-full overflow-hidden rounded-2xl bg-inv-bg py-3.5 text-sm font-semibold text-inv-fg transition-opacity disabled:opacity-40"
              >
                <span className="relative z-10">{s.approveBtn}</span>
                <motion.span
                  className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-black/15"
                  initial={{ x: "-120%" }}
                  animate={{ x: "320%" }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
                />
              </motion.button>
              )}
              <button
                onClick={onDecline}
                className="w-full rounded-2xl border border-line py-2.5 text-sm font-medium text-fg-soft transition-colors hover:bg-bg-soft"
              >
                {s.decline}
              </button>
              <p className="text-center text-[11px] leading-snug text-fg-muted">{s.approveNote}</p>
            </motion.div>
          ) : (
            <motion.div key={status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5">
              {status === "held" && holdExpiresAt && (
                <HoldCountdown until={holdExpiresAt} lang={lang} total={10 * 60_000} />
              )}
              {status !== "held" && (
                <div
                  className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-sm font-semibold ${
                    status === "captured" ? "bg-inv-bg text-inv-fg" : "bg-bg-soft"
                  } ${status === "error" ? "text-danger" : ""}`}
                >
                  {status === "processing" && <Loader2 className="size-4 shrink-0 animate-spin" />}
                  {status === "captured" && <Check className="size-4 shrink-0" />}
                  {status === "error" && <AlertTriangle className="size-4 shrink-0" />}
                  <span>{status === "error" ? message : statusLine[status]}</span>
                </div>
              )}
              {status === "held" && (
                <div className="flex gap-2">
                  {onCancelHold && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={onCancelHold}
                      className="flex-1 rounded-2xl border border-fg py-2.5 text-xs font-semibold"
                    >
                      {s.cancelHold}
                    </motion.button>
                  )}
                  {onCaptureNow && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={onCaptureNow}
                      className="flex-1 rounded-2xl bg-inv-bg py-2.5 text-xs font-semibold text-inv-fg"
                    >
                      {s.confirmCapture}
                    </motion.button>
                  )}
                </div>
              )}
              {status === "held" && (
                <p className="text-center text-[11px] leading-snug text-fg-muted">
                  {lang === "ar"
                    ? "المبلغ محجوز في PayPal ومتخصمش. تقدر تلغي ويرجع فورًا."
                    : "Funds are held in PayPal, not charged. Cancel to release them instantly."}
                </p>
              )}
              {status === "error" && onRetry && (
                <button
                  onClick={onRetry}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-line py-2.5 text-xs font-medium hover:bg-bg-soft"
                >
                  <RotateCcw className="size-3.5" />
                  {lang === "ar" ? "حاول تاني" : "Try again"}
                </button>
              )}
              {status === "captured" && (
                <TrustReceipt
                  offer={offer}
                  lang={lang}
                  context={context}
                  mandate={mandate}
                  negotiation={negotiation}
                  orderId={orderId}
                  captureId={captureId}
                  refunded={!!refund}
                  protection={protection}
                />
              )}
              {status === "captured" && !refund && onPatch && (
                <PriceProtectionPanel
                  lang={lang}
                  offer={offer}
                  captureId={captureId}
                  captureToken={captureToken}
                  demo={!!demo}
                  protection={protection}
                  onUpdate={(p) => onPatch({ protection: p })}
                />
              )}
              {status === "captured" && (
                <AfterCare lang={lang} tracking={tracking} refund={refund} onTrack={onTrack} onRefund={onRefund} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
