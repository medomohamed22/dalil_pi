"use client";

import { m, AnimatePresence } from "framer-motion";
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
  Navigation,
  Phone,
  Truck,
  ScanSearch,
  Scale,
  AlertTriangle,
  Camera,
  Lock,
  ScanBarcode,
  MousePointerClick,
  AppWindow,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney, type Strings } from "@/lib/i18n";
import type { Block, Lang, LinkPreview, Offer, Step } from "@/lib/types";
import { PiBagMark } from "./Logo";

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
    <m.a
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
    </m.a>
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
    map_of_pi: "بيدوّر في Map of Pi",
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
    map_of_pi: "Searching Map of Pi",
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
        <PiBagMark size={15} className="logo-think" />
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
  const searches = steps.filter((x) => x.tool === "web_search" || x.tool === "search_salla" || x.tool === "map_of_pi").length;
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
      <m.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-bg-soft"
      >
        <div className="flex items-center gap-3 px-3.5 pt-3.5">
          <RadarMark />
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
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
              </m.div>
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              {note && (
                <m.p
                  key={note}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-muted"
                  dir="auto"
                >
                  {note}
                </m.p>
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
                  <m.div
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
                  <m.span
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
                  </m.span>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Rotating tips */}
        <div className="mt-3 border-t border-line px-3.5 py-2.5">
          <AnimatePresence mode="wait" initial={false}>
            <m.p
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
            </m.p>
          </AnimatePresence>
        </div>
      </m.div>
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
        <m.span animate={{ rotate: open ? 180 : 0 }} className="shrink-0 text-[10px] text-fg-muted">
          ▾
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.ul
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
          </m.ul>
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
          <m.div
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
            <m.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
            />
          </m.div>
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
    <m.div
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
            <m.img
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
    </m.div>
  );
}

/* ---------- Product offers ---------- */

function trustTone(n: number) {
  return n >= 60 ? "text-emerald-700 dark:text-emerald-400" : n >= 40 ? "text-amber-700 dark:text-amber-400" : "text-danger";
}

/** 🛡️ trust number (0–100). Tap for the breakdown. */
function TrustPill({ offer, s, open, onToggle }: { offer: Offer; s: Strings; open: boolean; onToggle: () => void }) {
  const n = offer.trustScore;
  if (n == null) {
    const Icon = offer.trust === "verified" ? ShieldCheck : offer.trust === "suspicious" ? ShieldAlert : Shield;
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] ${offer.trust === "suspicious" ? "font-medium text-danger" : "text-fg-muted"}`}>
        <Icon className="size-3" /> {offer.trust === "verified" ? s.verified : offer.trust === "suspicious" ? s.suspicious : s.unknownStore}
      </span>
    );
  }
  const Icon = n >= 60 ? ShieldCheck : n >= 40 ? Shield : ShieldAlert;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={`${s.trust} ${n}/100 · ${s.trustLevel(n)}`}
      data-testid="trust"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${trustTone(n)}`}
    >
      <Icon className="size-3" /> <CountUp to={n} />
    </button>
  );
}

function TrustBreakdown({ offer, s }: { offer: Offer; s: Strings }) {
  const p = offer.trustParts;
  if (!p || offer.trustScore == null) return null;
  return (
    <div className="rounded-xl bg-bg-soft p-2 text-[11px]" data-testid="trust-breakdown">
      <div className={`mb-1 font-semibold ${trustTone(offer.trustScore)}`}>
        {s.trust} {offer.trustScore}/100 · {s.trustLevel(offer.trustScore)}
      </div>
      {(Object.keys(p) as (keyof typeof p)[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-fg-muted">{s.trustParts[k]}</span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted">
            <span className="block h-full rounded-full bg-fg" style={{ width: `${Math.round(p[k] * 100)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

type SortKey = "best" | "cheapest" | "trust" | "rating" | "nearest";

/** Client-side re-ordering of the cards; offers you can't order (low trust, not in Pi) stay last. */
function sortOffers(offers: Offer[], k: SortKey): Offer[] {
  if (k === "best") return offers;
  const blocked = (o: Offer) => Number(o.trust === "suspicious" || (o.trustScore ?? 50) < 40 || o.flags.includes("not_priced_in_pi"));
  const key: Record<Exclude<SortKey, "best">, (o: Offer) => number> = {
    cheapest: (o) => o.totalUsd ?? o.total,
    trust: (o) => -(o.trustScore ?? 0),
    rating: (o) => -((o.rating ?? 0) * 1000 + Math.min(999, o.reviewCount ?? 0)),
    nearest: (o) => o.distanceKm ?? Number.MAX_SAFE_INTEGER,
  };
  return [...offers].sort((a, b) => blocked(a) - blocked(b) || key[k](a) - key[k](b));
}

/** Google Maps link: exact pin when the shop's location is known, else name + address/city. */
function mapsUrl(o: Offer, city?: string, directions = false): string {
  const dest = o.lat != null && o.lon != null ? `${o.lat},${o.lon}` : [o.store, o.address ?? city ?? ""].filter(Boolean).join(" ");
  return directions
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
}

const FLAG_TEXT: Record<string, { ar: string; en: string }> = {
  price_far_below_market: { ar: "السعر أقل من السوق بشكل مريب", en: "Price suspiciously below market" },
  suspicious_discount: { ar: "خصم مبالغ فيه — غالبًا وهمي", en: "Inflated 'was' price — likely fake discount" },
  few_perfect_reviews: { ar: "تقييمات كاملة لكن قليلة جدًا", en: "Few, perfect reviews" },
  no_source_link: { ar: "مفيش لينك للمصدر", en: "No source link" },
  out_of_stock: { ar: "خلصان حاليًا", en: "Out of stock" },
  price_unverified: { ar: "السعر ده متأكدناش منه من صفحة المتجر", en: "Price not confirmed on the store page" },
  not_priced_in_pi: { ar: "السعر مش بالباي — اتأكد إن المتجر بيقبل باي", en: "Not priced in Pi — check the store accepts Pi" },
  new_domain: { ar: "الموقع جديد (أقل من 6 شهور)", en: "Very new website (under 6 months)" },
};

export function ProductCards({
  offers,
  s,
  lang,
  city,
  onOrder,
  ordersLeft,
  onWatch,
  onAsk,
}: {
  offers: Offer[];
  s: Strings;
  lang: Lang;
  city?: string;
  onOrder?: (o: Offer) => void;
  /** Orders left this month (null = unknown). */
  ordersLeft?: number | null;
  onWatch?: (o: Offer) => Promise<boolean>;
  onAsk?: (text: string) => void;
}) {
  const badgeText: Record<string, string> = {
    cheapest: s.cheapest,
    topRated: s.topRated,
    bestValue: s.bestValue,
    nearest: s.nearest,
  };
  const [why, setWhy] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("best");
  const [detail, setDetail] = useState<Offer | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const twins = useTwins(offers);
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));
  const sorts: SortKey[] = ["best", "cheapest", "trust", "rating", ...(offers.some((o) => o.distanceKm != null) ? (["nearest"] as SortKey[]) : [])];
  const shown = sortOffers(offers, sort);
  return (
    <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full">
      {offers.length >= 3 && (
        <div className="no-scrollbar mb-1 flex gap-1.5 overflow-x-auto px-4 sm:px-0" role="radiogroup" aria-label={s.sortBy} data-testid="sort">
          {sorts.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={sort === k}
              onClick={() => setSort(k)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${sort === k ? "border-fg bg-inv-bg text-inv-fg" : "border-line text-fg-soft hover:bg-bg-soft"}`}
            >
              {s.sorts[k]}
            </button>
          ))}
        </div>
      )}
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:px-0">
        {shown.map((o, i) => {
          const isTop = i === 0 && sort === "best" && o.trust !== "suspicious";
          return (
            <m.div
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
              <div className="relative cursor-pointer" onClick={() => setDetail(o)} data-testid="open-detail">
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
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{o.store}</span>
                  <TrustPill offer={o} s={s} open={why === o.id} onToggle={() => setWhy((w) => (w === o.id ? null : o.id))} />
                </div>
                {why === o.id && <TrustBreakdown offer={o} s={s} />}
                <button type="button" onClick={() => setDetail(o)} className="line-clamp-2 min-h-[2.5rem] text-start text-[13px] leading-snug text-fg-soft hover:text-fg" dir="auto">
                  {o.title}
                </button>
                {twins.get(o.id) && (
                  <div className="text-[11px] text-fg-muted" data-testid="twin">
                    {s.alsoAt(twins.get(o.id)!.store, formatMoney(twins.get(o.id)!.total, twins.get(o.id)!.currency, lang))}
                  </div>
                )}
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
                      href={mapsUrl(o, city)}
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
                {o.address && (
                  <div className="line-clamp-2 text-[11px] text-fg-muted" dir="auto">
                    <MapPin className="me-1 inline size-3" />
                    {o.address}
                  </div>
                )}
                {(o.kind === "local" || o.kind === "service") && (o.address || o.lat != null || o.phone || o.distanceKm != null) && (
                  <div className="flex gap-1.5" data-testid="local-actions">
                    <a
                      href={mapsUrl(o, city, true)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line py-1.5 text-[11px] font-medium hover:bg-bg-soft"
                    >
                      <Navigation className="size-3" /> {s.directions}
                    </a>
                    {o.phone && (
                      <a href={`tel:${o.phone}`} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-line py-1.5 text-[11px] font-medium hover:bg-bg-soft" dir="ltr">
                        <Phone className="size-3" /> {s.call}
                      </a>
                    )}
                  </div>
                )}
                {!!o.reviews?.length && (
                  <div className="space-y-1 rounded-xl bg-bg-soft p-2" data-testid="reviews">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{s.realReviews}</div>
                    {o.reviews.map((q, k) => (
                      <p key={k} className="line-clamp-2 text-[11px] italic leading-snug text-fg-soft" dir="auto">
                        “{q}”
                      </p>
                    ))}
                  </div>
                )}
                {o.piEvidence && (
                  <div className="line-clamp-2 text-[11px] text-fg-muted" dir="auto" title={o.piEvidence}>
                    π {o.piEvidence}
                  </div>
                )}
                <div className="mt-auto flex flex-col gap-1.5 pt-2">
                  {offers.length >= 2 && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
                      <input type="checkbox" checked={picked.includes(o.id)} onChange={() => togglePick(o.id)} className="size-3.5 accent-current" data-testid="compare-pick" />
                      {s.compare}
                    </label>
                  )}
                  {(() => {
                    const lowTrust = o.trustScore != null && o.trustScore < 40;
                    const orderable = !!(onOrder && o.url && o.sig && o.trust !== "suspicious" && !lowTrust && !o.flags.includes("price_unverified") && !o.flags.includes("not_priced_in_pi"));
                    if (orderable) {
                      const out = ordersLeft != null && ordersLeft <= 0;
                      return (
                        <>
                          <m.button
                            whileTap={{ scale: 0.96 }}
                            disabled={out}
                            onClick={() => {
                              // 40–59: ask once more before sending the user to a less-known store.
                              if (o.trustScore != null && o.trustScore < 60 && !window.confirm(s.cautionConfirm(o.trustScore))) return;
                              onOrder!(o);
                            }}
                            title={s.payInStore}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2 text-xs font-semibold text-inv-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            <Package className="size-3.5" /> {o.checkout === "woo_pi" ? s.autoOrder : s.order} <ExternalLink className="size-3" />
                          </m.button>
                          {o.checkout === "woo_pi" && <span className="text-center text-[10.5px] font-medium text-fg-soft" data-testid="auto-tag">⚡ {s.autoTag}</span>}
                          {out && <span className="text-center text-[10.5px] text-danger">{s.noOrdersLeft}</span>}
                        </>
                      );
                    }
                    return o.url ? (
                      <>
                        {lowTrust && <span className="text-center text-[10.5px] text-danger">{s.lowTrustNoOrder}</span>}
                        <a
                        href={o.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-1 rounded-xl border border-line py-2 text-xs font-medium text-fg-soft hover:bg-bg-soft"
                      >
                        {s.view} <ExternalLink className="size-3" />
                      </a>
                      </>
                    ) : null;
                  })()}
                </div>
              </div>
            </m.div>
          );
        })}
      </div>
      <AnimatePresence>
        {picked.length >= 2 && (
          <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mx-4 mt-1 flex items-center justify-between rounded-2xl bg-inv-bg px-3 py-2 text-inv-fg sm:mx-0">
            <span className="text-[12px]">{s.comparePicked(picked.length)}</span>
            <span className="flex gap-2">
              <button onClick={() => setPicked([])} className="text-[12px] opacity-70">
                {s.cancel}
              </button>
              <button onClick={() => setComparing(true)} className="rounded-full bg-bg px-3 py-1 text-[12px] font-semibold text-fg" data-testid="compare-open">
                {s.compare}
              </button>
            </span>
          </m.div>
        )}
      </AnimatePresence>
      <BottomSheet open={!!detail} title={detail?.store ?? ""} onClose={() => setDetail(null)}>
        {detail && (
          <OfferDetail
            o={detail}
            s={s}
            lang={lang}
            city={city}
            onOrder={onOrder}
            ordersLeft={ordersLeft}
            twin={twins.get(detail.id)}
            onWatch={onWatch}
            onAsk={
              onAsk
                ? (t) => {
                    setDetail(null);
                    onAsk(t);
                  }
                : undefined
            }
          />
        )}
      </BottomSheet>
      <BottomSheet open={comparing} title={s.compare} onClose={() => setComparing(false)}>
        <CompareTable offers={offers.filter((o) => picked.includes(o.id))} s={s} lang={lang} />
      </BottomSheet>
    </div>
  );
}

/* ---------- Extras: count-up, sheets, detail, compare, twins ---------- */

/** Counts from 0 to `to` (~600 ms). Shows the number right away when the user prefers reduced motion. */
export function CountUp({ to, ms = 600 }: { to: number; ms?: number }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <span className="tabular-nums">{v}</span>;
}

/** Animated ✓ for success moments (plan paid, order placed). */
export function AnimatedCheck({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <m.circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
      <m.path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.3 }} />
    </svg>
  );
}

export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="truncate text-base font-semibold">{title}</div>
              <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-bg-soft">
                <X className="size-4" />
              </button>
            </div>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function OfferDetail({
  o,
  s,
  lang,
  city,
  onOrder,
  ordersLeft,
  twin,
  onWatch,
  onAsk,
}: {
  o: Offer;
  s: Strings;
  lang: Lang;
  city?: string;
  onOrder?: (o: Offer) => void;
  ordersLeft?: number | null;
  twin?: Offer;
  onWatch?: (o: Offer) => Promise<boolean>;
  onAsk?: (text: string) => void;
}) {
  const [watched, setWatched] = useState<"idle" | "busy" | "done">("idle");
  const nf = (n: number) => n.toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US");
  const lowTrust = o.trustScore != null && o.trustScore < 40;
  const orderable = !!(onOrder && o.url && o.sig && o.trust !== "suspicious" && !lowTrust && !o.flags.includes("price_unverified") && !o.flags.includes("not_priced_in_pi"));
  return (
    <div className="space-y-3" data-testid="offer-detail">
      <SmartImage src={o.image} alt={o.title} fallbackLabel={o.store} className="h-56 w-full rounded-2xl" />
      <div className="text-[15px] font-semibold leading-snug" dir="auto">
        {o.title}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tabular-nums" dir="ltr">
            {formatMoney(o.total, o.currency, lang)}
          </div>
          {o.totalUsd != null && <div className="text-[12px] text-fg-muted" dir="ltr">≈ {formatMoney(o.totalUsd, "USD", lang)}</div>}
        </div>
        {o.rating != null && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="size-4 fill-current" /> <span className="font-medium">{o.rating.toFixed(1)}</span>
            {o.reviewCount != null && <span className="text-fg-muted">({nf(o.reviewCount)})</span>}
          </div>
        )}
      </div>
      {twin && <div className="rounded-xl bg-bg-soft px-3 py-2 text-[12px]">{s.alsoAt(twin.store, formatMoney(twin.total, twin.currency, lang))}</div>}
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl border border-line p-2">
          <div className="text-fg-muted">{s.shipping}</div>
          <div className="font-medium">{o.shipping ? formatMoney(o.shipping, o.currency, lang) : o.shipping === 0 ? s.free : "—"}</div>
        </div>
        <div className="rounded-xl border border-line p-2">
          <div className="text-fg-muted">{o.distanceKm != null ? s.km : s.days}</div>
          <div className="font-medium">{o.distanceKm != null ? nf(o.distanceKm) : o.deliveryDays != null ? nf(o.deliveryDays) : "—"}</div>
        </div>
      </div>
      <TrustBreakdown offer={o} s={s} />
      {!!o.reviews?.length && (
        <div className="space-y-1 rounded-xl bg-bg-soft p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{s.realReviews}</div>
          {o.reviews.map((q, k) => (
            <p key={k} className="text-[12px] italic text-fg-soft" dir="auto">
              “{q}”
            </p>
          ))}
        </div>
      )}
      {o.flags.filter((f) => FLAG_TEXT[f]).map((f) => (
        <div key={f} className="flex items-start gap-1 text-[12px] text-danger">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> {FLAG_TEXT[f][lang]}
        </div>
      ))}
      {o.piEvidence && <p className="text-[12px] text-fg-muted" dir="auto">π {o.piEvidence}</p>}
      {o.address && (
        <a href={mapsUrl(o, city, true)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] underline underline-offset-2">
          <Navigation className="size-3.5" /> {o.address}
        </a>
      )}
      <div className="flex gap-2">
        {onWatch && o.url && o.sig && !o.flags.includes("price_unverified") && (
          <button
            disabled={watched !== "idle"}
            onClick={async () => {
              setWatched("busy");
              setWatched((await onWatch(o)) ? "done" : "idle");
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-line py-2.5 text-[12px] font-medium disabled:opacity-80"
            data-testid="watch-btn"
          >
            {watched === "done" ? (
              <>
                <AnimatedCheck size={16} /> {s.watching}
              </>
            ) : watched === "busy" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>♡ {s.watch}</>
            )}
          </button>
        )}
        {onAsk && (
          <button onClick={() => onAsk(s.moreFromStore(o.store))} className="flex flex-1 items-center justify-center rounded-2xl border border-line py-2.5 text-[12px] font-medium" data-testid="more-from-store">
            {s.moreFromStoreBtn}
          </button>
        )}
      </div>
      {orderable ? (
        <button
          disabled={ordersLeft != null && ordersLeft <= 0}
          onClick={() => {
            if (o.trustScore != null && o.trustScore < 60 && !window.confirm(s.cautionConfirm(o.trustScore))) return;
            onOrder!(o);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg disabled:opacity-40"
        >
          <Package className="size-4" /> {o.checkout === "woo_pi" ? s.autoOrder : s.order}
        </button>
      ) : o.url ? (
        <a href={o.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-1 rounded-2xl border border-line py-3 text-sm font-medium">
          {s.view} <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function CompareTable({ offers, s, lang }: { offers: Offer[]; s: Strings; lang: Lang }) {
  const nf = (n?: number) => (n == null ? "—" : n.toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US"));
  const cheapest = Math.min(...offers.map((o) => o.totalUsd ?? o.total));
  const trusted = Math.max(...offers.map((o) => o.trustScore ?? 0));
  const rows: [string, (o: Offer) => React.ReactNode, ((o: Offer) => boolean)?][] = [
    [s.total, (o) => <span dir="ltr">{formatMoney(o.total, o.currency, lang)}</span>, (o) => (o.totalUsd ?? o.total) === cheapest],
    ["≈ $", (o) => (o.totalUsd != null ? formatMoney(o.totalUsd, "USD", lang) : "—")],
    [s.trust, (o) => nf(o.trustScore), (o) => (o.trustScore ?? 0) === trusted],
    ["★", (o) => (o.rating != null ? `${o.rating.toFixed(1)} (${nf(o.reviewCount)})` : "—")],
    [s.shipping, (o) => (o.shipping ? formatMoney(o.shipping, o.currency, lang) : o.shipping === 0 ? s.free : "—")],
    [s.km, (o) => nf(o.distanceKm)],
    [s.days, (o) => nf(o.deliveryDays)],
  ];
  return (
    <div className="overflow-x-auto" data-testid="compare-table">
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <th />
            {offers.map((o) => (
              <th key={o.id} className="p-1.5 text-start align-top font-semibold" dir="auto">
                <div className="line-clamp-2">{o.title}</div>
                <div className="font-normal text-fg-muted">{o.store}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell, best]) => (
            <tr key={label} className="border-t border-line">
              <td className="p-1.5 text-fg-muted">{label}</td>
              {offers.map((o) => (
                <td key={o.id} className={`p-1.5 tabular-nums ${best?.(o) ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}`}>
                  {cell(o)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Same product in another store: word overlap of the titles (Jaccard ≥ 0.6), cheapest other store wins. */
function useTwins(offers: Offer[]): Map<string, Offer> {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((w) => w.length > 1));
  const out = new Map<string, Offer>();
  const ws = offers.map((o) => words(o.title));
  offers.forEach((a, i) => {
    let best: Offer | undefined;
    offers.forEach((b, j) => {
      if (i === j || a.store === b.store || a.currency !== b.currency) return;
      const inter = [...ws[i]].filter((w) => ws[j].has(w)).length;
      const uni = new Set([...ws[i], ...ws[j]]).size;
      if (uni && inter / uni >= 0.6 && (!best || b.total < best.total)) best = b;
    });
    if (best) out.set(a.id, best);
  });
  return out;
}
