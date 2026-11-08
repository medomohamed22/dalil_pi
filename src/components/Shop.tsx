"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Code,
  CreditCard,
  ExternalLink,
  Gift,
  Hammer,
  Headphones,
  House,
  Loader2,
  LocateFixed,
  MapPin,
  Palette,
  Receipt,
  Search,
  Shirt,
  ShieldCheck,
  Share2,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Star,
  Store,
  UserRound,
  UtensilsCrossed,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countryLabel, type Strings } from "@/lib/i18n";
import { STORE_DIRECTORY, type StoreEntry } from "@/lib/stores";
import { track } from "@/lib/track";
import type { Lang, LocalShop, Offer } from "@/lib/types";
import { BottomSheet, OfferDetail, SmartImage } from "./cards";
import { ShopCards } from "./Shops";

/* ------------------------------------------------------------------ */
/* Views + URL                                                          */
/* ------------------------------------------------------------------ */

export type View =
  | { v: "home" }
  | { v: "search"; q: string; any?: string; cat?: string; title?: string; store?: string }
  | { v: "stores"; tab?: string }
  | { v: "store"; id: string }
  | { v: "services" }
  | { v: "p"; id: string }
  | { v: "ask" };

export function viewFromUrl(search: string): View {
  const p = new URLSearchParams(search);
  switch (p.get("v")) {
    case "search":
      return { v: "search", q: p.get("q") ?? "", any: p.get("any") ?? undefined, cat: p.get("cat") ?? undefined, title: p.get("t") ?? undefined, store: p.get("store") ?? undefined };
    case "stores":
      return { v: "stores", tab: p.get("tab") ?? undefined };
    case "store":
      return p.get("id") ? { v: "store", id: p.get("id")! } : { v: "stores" };
    case "services":
      return { v: "services" };
    case "p":
      return p.get("id") ? { v: "p", id: p.get("id")! } : { v: "home" };
    case "ask":
      return { v: "ask" };
    default:
      return { v: "home" };
  }
}

export function viewToUrl(view: View): string {
  const p = new URLSearchParams();
  if (view.v !== "home") p.set("v", view.v);
  if (view.v === "search") {
    if (view.q) p.set("q", view.q);
    if (view.any) p.set("any", view.any);
    if (view.cat) p.set("cat", view.cat);
    if (view.title) p.set("t", view.title);
    if (view.store) p.set("store", view.store);
  }
  if (view.v === "stores" && view.tab) p.set("tab", view.tab);
  if (view.v === "store" || view.v === "p") p.set("id", view.id);
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

export const viewKey = (v: View) => viewToUrl(v);

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

const memo = new Map<string, unknown>();

/** GET JSON with an in-memory cache: going back shows the last result instantly. */
function useJson<T>(url: string | null): { data?: T; loading: boolean; error?: string; reload: () => void } {
  const [state, setState] = useState<{ url: string | null; data?: T; error?: string; loading: boolean }>(() => ({ url, data: url ? (memo.get(url) as T | undefined) : undefined, loading: !!url && !memo.has(url) }));
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    const hit = memo.get(url) as T | undefined;
    setState({ url, data: hit, loading: !hit });
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        memo.set(url, j);
        if (memo.size > 80) memo.delete(memo.keys().next().value as string);
        setState({ url, data: j as T, loading: false });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState((s) => ({ ...s, loading: false, error: e.message }));
      });
    return () => ctrl.abort();
  }, [url, n]);
  return { data: state.url === url ? state.data : undefined, loading: state.loading, error: state.error, reload: () => setN((x) => x + 1) };
}

interface SearchResponse {
  offers: Offer[];
  total: number;
  stores: Record<string, number>;
  categories: string[];
  ms: number;
}
interface StoresResponse {
  stores: Array<StoreEntry & { products: number | null; totalProducts: number | null; ageMin: number | null; trustScore: number | null }>;
}
type DirStore = StoresResponse["stores"][number];

const STORE_NAMES: Record<string, string> = { pcm: "Pi Chain Mall", salla: "Salla Shop Mall", pkt: "Piketplace", gtp: "Global Trade Pi" };

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : n < 1000 ? 1 : 0 });

export function PiPrice({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`font-semibold tabular-nums ${className}`} dir="ltr">
      {fmt(value)} <span className="text-gold">π</span>
    </span>
  );
}

function TrustChip({ n, s, compact }: { n?: number | null; s: Strings; compact?: boolean }) {
  if (n == null) return null;
  const tone = n >= 60 ? "bg-ok-soft text-ok" : n >= 40 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-danger/10 text-danger";
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${tone}`} title={`${s.trust} ${n}/100`}>
      <ShieldCheck className="size-3" /> {n}
      {!compact && <span className="font-medium"> {s.trust}</span>}
    </span>
  );
}

function StoreLogo({ st, size = 44 }: { st: Pick<StoreEntry, "color" | "mono" | "name" | "logo">; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (st.logo && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={st.logo} alt={st.name} width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className="shrink-0 rounded-2xl bg-white object-contain shadow-sm ring-1 ring-line" style={{ width: size, height: size }} />
    );
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-sm"
      style={{ background: st.color, width: size, height: size, fontSize: size * (st.mono.length > 1 ? 0.34 : 0.45) }}
      aria-hidden
    >
      {st.mono}
    </span>
  );
}

const LOGO_BY_NAME: Record<string, string | undefined> = Object.fromEntries(STORE_DIRECTORY.filter((d) => d.source && d.logo).map((d) => [d.name, d.logo]));

/** Product tile for grids (2 columns on phones). */
export function ProductTile({ o, s, onOpen, i = 0, wide }: { o: Offer; s: Strings; onOpen: (o: Offer) => void; i?: number; wide?: boolean }) {
  const badge = o.badges.includes("bestValue") ? s.bestValue : o.badges.includes("cheapest") ? s.cheapest : null;
  const off = o.listPrice && o.listPrice > o.price ? Math.round((1 - o.price / o.listPrice) * 100) : 0;
  const store = o.store.split(" · ")[0];
  // Compact, uniform card (like Salla Shop's): a fixed square photo — tall/wide photos are
  // fitted inside it and never stretch the card — then 2 lines of title and the price.
  return (
    <m.button
      type="button"
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(o)}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-bg text-start transition-colors hover:border-line-strong ${wide ? "w-[9.5rem] shrink-0 snap-start" : ""}`}
      data-testid="tile"
      data-store={store}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-white">
        <SmartImage src={o.image} alt={o.title} className="absolute inset-0 size-full p-1.5 transition-transform duration-300 group-hover:scale-[1.03]" fallbackLabel={store} />
        {badge && <span className="absolute start-1.5 top-1.5 rounded-full bg-bg/95 px-1.5 py-0.5 text-[9.5px] font-semibold shadow-sm">{badge}</span>}
        {off >= 3 && <span className="absolute end-1.5 top-1.5 rounded-full bg-ok px-1.5 py-0.5 text-[9.5px] font-bold text-white">↓{off}%</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2 pb-2 pt-1.5">
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-fg-muted">
          {LOGO_BY_NAME[store] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={LOGO_BY_NAME[store]} alt="" width={12} height={12} loading="lazy" className="size-3 shrink-0 rounded-[3px] bg-white object-contain" />
          )}
          <span className="truncate">{store}</span>
        </span>
        <span className="line-clamp-2 min-h-[2.5em] text-[12px] font-medium leading-[1.25]" dir="auto">
          {o.title}
        </span>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <PiPrice value={o.total} className="truncate text-[14px] leading-none" />
          <TrustChip n={o.trustScore} s={s} compact />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-fg-muted" dir="ltr">
          {o.totalUsd != null && <span>≈ ${o.totalUsd.toFixed(o.totalUsd < 100 ? 1 : 0)}</span>}
          {o.listPrice && o.listPrice > o.price ? <span className="line-through">{fmt(o.listPrice)} π</span> : null}
        </div>
      </div>
    </m.button>
  );
}

function TileSkeletons({ n = 4, wide }: { n?: number; wide?: boolean }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`overflow-hidden rounded-2xl border border-line ${wide ? "w-[9.5rem] shrink-0" : ""}`} aria-hidden>
          <div className="skeleton aspect-square w-full" />
          <div className="space-y-2 p-2.5">
            <div className="skeleton h-2.5 w-1/2 rounded" />
            <div className="skeleton h-3 w-11/12 rounded" />
            <div className="skeleton h-4 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center justify-between">
      <h2 className="text-[17px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

function SearchBox({ s, value, onSubmit, autoFocus, placeholder, onBack, testid = "shop-search" }: { s: Strings; value?: string; onSubmit: (q: string) => void; autoFocus?: boolean; placeholder?: string; onBack?: () => void; testid?: string }) {
  const [q, setQ] = useState(value ?? "");
  useEffect(() => setQ(value ?? ""), [value]);
  return (
    <form
      className="flex w-full min-w-0 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) onSubmit(q.trim());
      }}
    >
      {onBack && (
        <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-bg-soft" aria-label={s.back}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" />
        </button>
      )}
      <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-bg-soft px-4 shadow-card transition-colors focus-within:border-fg/40 focus-within:bg-bg">
        <Search className="size-[18px] shrink-0 text-fg-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? s.searchPh}
          autoFocus={autoFocus}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-muted"
          dir="auto"
          data-testid={testid}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="rounded-full p-1 text-fg-muted hover:text-fg" aria-label={s.clear}>
            <X className="size-4" />
          </button>
        )}
      </label>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom navigation + Ask Dalil                                        */
/* ------------------------------------------------------------------ */

export type NavTab = "home" | "stores" | "services" | "watch" | "account";

export function BottomNav({ s, active, onNav, watchBadge }: { s: Strings; active: NavTab | null; onNav: (t: NavTab) => void; watchBadge?: number }) {
  const items: Array<{ id: NavTab; label: string; Icon: typeof House }> = [
    { id: "home", label: s.navHome, Icon: House },
    { id: "stores", label: s.navStores, Icon: Store },
    { id: "services", label: s.navServices, Icon: Wrench },
    { id: "watch", label: s.navWatch, Icon: Bookmark },
    { id: "account", label: s.navAccount, Icon: UserRound },
  ];
  return (
    <nav className="shrink-0 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" data-testid="bottom-nav">
      <div className="mx-auto grid max-w-3xl grid-cols-5">
        {items.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button key={id} onClick={() => onNav(id)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${on ? "text-accent" : "text-fg-muted hover:text-fg"}`} aria-current={on ? "page" : undefined} data-testid={`nav-${id}`}>
              {on && <m.span layoutId="nav-dot" className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative">
                <Icon className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} />
                {!!watchBadge && id === "watch" && <span className="absolute -end-1.5 -top-1 flex size-4 items-center justify-center rounded-full bg-ok text-[9px] font-bold text-white">{watchBadge}</span>}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AskFab({ s, onClick }: { s: Strings; onClick: () => void }) {
  return (
    <m.button
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.2 }}
      onClick={onClick}
      className="absolute bottom-3 end-4 z-20 flex items-center gap-1.5 rounded-full bg-inv-bg px-4 py-3 text-[14px] font-semibold text-inv-fg shadow-lg shadow-black/20"
      data-testid="ask-fab"
    >
      {s.askDalil} <Sparkles className="size-4 text-gold" />
    </m.button>
  );
}

/* ------------------------------------------------------------------ */
/* Shop: the browse views                                               */
/* ------------------------------------------------------------------ */

export interface ShopActions {
  onOrder?: (o: Offer) => void;
  ordersLeft?: number | null;
  onWatch?: (o: Offer, target?: number | null) => Promise<boolean>;
  onCart?: (o: Offer) => void;
  inCart?: (id: string) => boolean;
  onAskShop?: (merchantId: string, question: string) => Promise<boolean>;
}

export function ShopViews({
  view,
  go,
  back,
  s,
  lang,
  country,
  onAsk,
  actions,
  coords,
  onLocate,
}: {
  view: View;
  go: (v: View) => void;
  back: () => void;
  s: Strings;
  lang: Lang;
  country: string;
  /** Opens Ask Dalil (AI) with a question. */
  onAsk: (text: string) => void;
  actions: ShopActions;
  coords?: { lat: number; lon: number } | null;
  onLocate: () => void;
}) {
  const [detail, setDetail] = useState<Offer | null>(null);
  // Products from Dalil Index open their own page (shareable link); others the quick sheet.
  const open = useCallback((o: Offer) => (o.ref ? go({ v: "p", id: o.ref }) : setDetail(o)), [go]);
  const common = { s, lang, country, go, back, onOpen: open, onAsk };
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={viewKey(view)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {view.v === "home" && <HomeView {...common} />}
          {view.v === "search" && <SearchView {...common} view={view} />}
          {view.v === "stores" && <StoresView {...common} tab={view.tab} />}
          {view.v === "store" && <StoreView {...common} id={view.id} />}
          {view.v === "services" && <ServicesView {...common} coords={coords} onLocate={onLocate} />}
          {view.v === "p" && <ProductView {...common} id={view.id} actions={actions} />}
        </m.div>
      </AnimatePresence>
      <BottomSheet open={!!detail} title={detail?.store ?? ""} onClose={() => setDetail(null)}>
        {detail && (
          <OfferDetail
            o={detail}
            s={s}
            lang={lang}
            onOrder={actions.onOrder}
            ordersLeft={actions.ordersLeft}
            onWatch={actions.onWatch}
            onCart={actions.onCart}
            inCart={actions.inCart}
            onAskShop={actions.onAskShop}
            onAsk={(t) => {
              setDetail(null);
              onAsk(t);
            }}
          />
        )}
      </BottomSheet>
    </>
  );
}

interface CommonProps {
  s: Strings;
  lang: Lang;
  country: string;
  go: (v: View) => void;
  back: () => void;
  onOpen: (o: Offer) => void;
  onAsk: (text: string) => void;
}

/* ---------- Home ---------- */

export const CATEGORIES: Array<{ id: keyof Strings["cat"]; Icon: typeof House; any: string; cat?: string }> = [
  { id: "phones", Icon: Smartphone, cat: "phones", any: "phone|mobile|smartphone|موبايل|هاتف|جوال|iphone|samsung|redmi|infinix" },
  { id: "headphones", Icon: Headphones, cat: "headphones", any: "headphones|earbuds|earphones|سماعة|سماعات|buds" },
  { id: "perfume", Icon: SprayCan, cat: "perfume,beauty", any: "perfume|fragrance|cologne|عطر|برفان" },
  { id: "supermarket", Icon: ShoppingBasket, cat: "grocery", any: "tea|coffee|honey|rice|oil|sugar|شاي|قهوة|عسل|رز|سوبر ماركت" },
  { id: "fashion", Icon: Shirt, cat: "fashion,shoes", any: "shirt|shoes|dress|jacket|clothes|sneakers|ملابس|حذاء|تيشيرت|فستان" },
  { id: "topup", Icon: CreditCard, cat: "topup,gift_cards", any: "top up|recharge|gift card|شحن رصيد|كارت|رصيد" },
  { id: "home", Icon: Sofa, cat: "home,appliances", any: "kitchen|cleaning|vacuum|منزلية|مطبخ|منظفات|ادوات منزلية" },
  { id: "services", Icon: Wrench, any: "" },
];

/** The home page's first row (the owner can change it from /admin → Settings). */
export interface HomeFeatured {
  store: string;
  cats: string;
  title_en: string;
  title_ar: string;
}
export const DEFAULT_FEATURED: HomeFeatured = { store: "salla", cats: "phones,headphones,computers,tv_audio", title_en: "Phones & electronics", title_ar: "موبايلات وإلكترونيات" };

function HomeView({ s, lang, country, go, onOpen }: CommonProps) {
  const site = useJson<{ featured?: HomeFeatured; announcement?: { on: boolean; en: string; ar: string } }>("/api/site");
  const ann = site.data?.announcement;
  const annText = ann?.on ? (lang === "ar" ? ann.ar || ann.en : ann.en || ann.ar) : "";
  const fe = site.data?.featured ?? (site.loading ? null : DEFAULT_FEATURED);
  const featuredUrl = fe ? `/api/search?country=${country}&limit=12${fe.store ? `&store=${fe.store}` : ""}${fe.cats ? `&cat=${encodeURIComponent(fe.cats)}` : ""}` : null;
  const featuredMain = useJson<SearchResponse>(featuredUrl);
  // The owner's row may not reach this country (Salla ships to Egypt, the Middle East and Africa):
  // then the same categories from any store here, then whatever is sold here.
  const none = (r: { data?: SearchResponse | null }) => !!r.data && r.data.offers.length === 0;
  const featuredAny = useJson<SearchResponse>(fe && none(featuredMain) ? `/api/search?country=${country}&limit=12${fe.cats ? `&cat=${encodeURIComponent(fe.cats)}` : ""}` : null);
  const featuredLocal = useJson<SearchResponse>(none(featuredMain) && none(featuredAny) ? `/api/search?country=${country}&limit=12` : null);
  const fallback = !none(featuredMain) ? "main" : !featuredAny.data ? "wait" : !none(featuredAny) ? "any" : "local";
  const featured = { data: fallback === "main" ? featuredMain.data : fallback === "any" ? featuredAny.data : fallback === "local" ? featuredLocal.data : null };
  const feLocal = fallback === "any" || fallback === "local";
  const deals = useJson<SearchResponse>(`/api/search?deals=1&limit=12&country=${country}`);
  const stores = useJson<StoresResponse>(`/api/stores?country=${country}`);
  const feStore = feLocal ? undefined : (stores.data?.stores ?? []).find((x) => x.source === fe?.store);
  const feTitle = fallback === "local" ? s.popular : fe ? (lang === "ar" ? fe.title_ar : fe.title_en) : "";
  return (
    <div className="pb-24 pt-1" data-testid="home">
      {annText && (
        <m.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-3 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[13px] font-medium text-accent" dir="auto" data-testid="announcement">
          📣 {annText}
        </m.div>
      )}
      <SearchBox s={s} onSubmit={(q) => go({ v: "search", q })} />
      <div className="no-scrollbar -mx-4 mt-4 flex gap-3 overflow-x-auto px-4" data-testid="categories">
        {CATEGORIES.map(({ id, Icon, any, cat }, i) => (
          <m.button
            key={id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => (id === "services" ? go({ v: "services" }) : go({ v: "search", q: "", any, cat, title: s.cat[id] }))}
            className="flex w-[4.4rem] shrink-0 flex-col items-center gap-1.5"
            data-testid={`cat-${id}`}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-bg-muted text-fg transition-colors hover:bg-accent-soft hover:text-accent">
              <Icon className="size-6" strokeWidth={1.7} />
            </span>
            <span className="text-center text-[11.5px] leading-tight">{s.cat[id]}</span>
          </m.button>
        ))}
      </div>

      <SectionTitle
        action={
          fe && (
            <button onClick={() => go({ v: "search", q: "", cat: fallback === "local" ? undefined : fe.cats || undefined, store: feLocal ? undefined : fe.store || undefined, title: feTitle })} className="text-[13px] font-medium text-accent" data-testid="featured-all">
              {s.seeAll}
            </button>
          )
        }
      >
        <span className="flex items-center gap-1.5">
          {feStore?.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={feStore.logo} alt="" className="size-5 rounded-md bg-white object-contain ring-1 ring-line" />
          )}
          {feTitle || s.popular}
          {feStore && <span className="text-[12px] font-medium text-fg-muted">· {feStore.name}</span>}
        </span>
      </SectionTitle>
      <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1" data-testid="home-featured">
        {!featured.data ? <TileSkeletons n={3} wide /> : featured.data.offers.map((o, i) => <ProductTile key={o.id} o={o} s={s} onOpen={onOpen} i={i} wide />)}
      </div>

      {!!deals.data?.offers.length && (
        <>
          <SectionTitle>{s.deals}</SectionTitle>
          <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1" data-testid="home-deals">
            {deals.data.offers.map((o, i) => <ProductTile key={o.id} o={o} s={s} onOpen={onOpen} i={i} wide />)}
          </div>
        </>
      )}

      <SectionTitle action={<button onClick={() => go({ v: "stores" })} className="text-[13px] font-medium text-accent">{s.seeAll}</button>}>{s.piStores}</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5" data-testid="home-stores">
        {(stores.data?.stores ?? []).filter((x) => x.source).sort((a, b) => (b.products ? 1 : 0) - (a.products ? 1 : 0)).slice(0, 4).map((st, i) => (
          <m.button
            key={st.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => go({ v: "store", id: st.id })}
            className="flex items-center gap-2.5 rounded-2xl bg-bg-soft p-3 text-start"
          >
            <StoreLogo st={st} size={40} />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold">{st.name}</span>
              <span className="mt-0.5 flex items-center gap-1">
                <TrustChip n={st.trustScore} s={s} />
              </span>
            </span>
          </m.button>
        ))}
        {stores.loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[4.25rem] rounded-2xl" />)}
      </div>

      {country === "EG" && (
        <m.button whileTap={{ scale: 0.98 }} onClick={() => go({ v: "services" })} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-start">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MapPin className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">{s.nearYou}</span>
            <span className="block text-[12px] text-fg-muted">Salla Local · {countryLabel(country, lang)}</span>
          </span>
          <ArrowLeft className="size-4 rotate-180 text-fg-muted rtl:rotate-0" />
        </m.button>
      )}
    </div>
  );
}

/* ---------- Search results ---------- */

type Sort = "best" | "cheapest" | "trust";

function SearchView({ s, lang, country, go, back, onOpen, onAsk, view }: CommonProps & { view: Extract<View, { v: "search" }> }) {
  const [sort, setSort] = useState<Sort>("best");
  const [store, setStore] = useState<string>(view.store ?? "");
  const [stock, setStock] = useState(false);
  const [price, setPrice] = useState<{ min?: number; max?: number }>({});
  const [sheet, setSheet] = useState<null | "price" | "store" | "sort">(null);
  const [pages, setPages] = useState(1);
  const params = useMemo(() => {
    const p = new URLSearchParams({ country, limit: String(24 * pages) });
    if (view.q) p.set("q", view.q);
    if (view.any) p.set("any", view.any);
    if (view.cat) p.set("cat", view.cat);
    if (sort !== "best") p.set("sort", sort);
    if (store) p.set("store", store);
    if (stock) p.set("stock", "1");
    if (price.min != null) p.set("min", String(price.min));
    if (price.max != null) p.set("max", String(price.max));
    return p.toString();
  }, [country, view.q, view.any, view.cat, sort, store, stock, price, pages]);
  const { data, loading } = useJson<SearchResponse>(`/api/search?${params}`);
  const [last, setLast] = useState<SearchResponse | undefined>();
  useEffect(() => {
    if (data) setLast(data);
  }, [data]);
  const shown = data ?? last;
  const storeCount = shown ? Object.values(shown.stores).filter(Boolean).length : 0;
  const title = view.title ?? view.q;
  const compareText = `${s.notSure}: ${title}`;

  const Chip = ({ on, children, onClick, testid }: { on?: boolean; children: React.ReactNode; onClick: () => void; testid?: string }) => (
    <button onClick={onClick} data-testid={testid} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${on ? "border-fg bg-fg text-bg" : "border-line hover:border-line-strong"}`}>
      {children}
    </button>
  );

  return (
    <div className="pb-24 pt-1" data-testid="search-view">
      <SearchBox s={s} value={view.q || view.title} onBack={back} onSubmit={(q) => go({ v: "search", q })} />
      <div className="mt-2 h-5 px-1 text-[12.5px] text-fg-muted" data-testid="result-meta">
        {shown ? s.results(shown.total, storeCount, shown.ms) : null}
        {loading && <Loader2 className="ms-1.5 inline size-3.5 animate-spin" />}
      </div>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1" data-testid="filters">
        <Chip on={price.min != null || price.max != null} onClick={() => setSheet("price")} testid="f-price">
          {s.filterPrice}
          {price.max != null ? ` ≤ ${price.max}` : price.min != null ? ` ≥ ${price.min}` : ""} <ChevronDown className="size-3.5" />
        </Chip>
        <Chip on={!!store} onClick={() => setSheet("store")} testid="f-store">
          {store ? STORE_NAMES[store] : s.filterStore} <ChevronDown className="size-3.5" />
        </Chip>
        <Chip on={stock} onClick={() => setStock((x) => !x)} testid="f-stock">
          {stock && <Check className="size-3.5" />} {s.filterStock}
        </Chip>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-fg/70 px-3 py-1.5 text-[13px] font-medium">
          <Check className="size-3.5" /> {s.shipsTo(countryLabel(country, lang))}
        </span>
        <Chip on={sort !== "best"} onClick={() => setSheet("sort")} testid="f-sort">
          {s.sortLabel}: {s.sortNames[sort]} <ChevronDown className="size-3.5" />
        </Chip>
      </div>

      {!shown && loading ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <TileSkeletons n={6} />
        </div>
      ) : shown && !shown.offers.length ? (
        <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-10 flex flex-col items-center gap-3 px-6 text-center" data-testid="no-results">
          <span className="flex size-14 items-center justify-center rounded-full bg-bg-muted">
            <Search className="size-6 text-fg-muted" />
          </span>
          <p className="text-[14px] text-fg-soft">{s.noResults}</p>
          <button onClick={() => onAsk(title)} className="flex items-center gap-1.5 rounded-full bg-inv-bg px-4 py-2.5 text-[14px] font-semibold text-inv-fg" data-testid="ask-web">
            <Sparkles className="size-4 text-gold" /> {s.searchWeb}
          </button>
        </m.div>
      ) : (
        <div className={`mt-3 grid grid-cols-2 gap-2.5 transition-opacity sm:grid-cols-3 lg:grid-cols-4 ${loading ? "opacity-60" : ""}`} data-testid="results">
          {(shown?.offers ?? []).map((o, i) => (
            <FragmentWithBanner key={o.id} i={i} show={(shown?.offers.length ?? 0) > 2} banner={<AskBanner s={s} onClick={() => onAsk(compareText)} />}>
              <ProductTile o={o} s={s} onOpen={onOpen} i={i % 24} />
            </FragmentWithBanner>
          ))}
        </div>
      )}
      {shown && shown.offers.length < shown.total && (
        <div className="mt-4 flex justify-center">
          <button onClick={() => setPages((p) => p + 1)} className="rounded-full border border-line px-5 py-2 text-[13px] font-medium hover:border-line-strong" data-testid="load-more">
            {s.loadMore}
          </button>
        </div>
      )}

      <BottomSheet open={sheet === "price"} title={s.filterPrice} onClose={() => setSheet(null)}>
        <PriceForm s={s} value={price} onApply={(v) => (setPrice(v), setSheet(null))} />
      </BottomSheet>
      <BottomSheet open={sheet === "store"} title={s.filterStore} onClose={() => setSheet(null)}>
        <div className="space-y-1" data-testid="store-options">
          {["", "pcm", "salla", "pkt", "gtp"].map((k) => (
            <button key={k} onClick={() => (setStore(k), setSheet(null))} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-[14px] ${store === k ? "bg-bg-muted font-semibold" : "hover:bg-bg-soft"}`}>
              <span>{k ? STORE_NAMES[k] : s.anyStore}</span>
              <span className="text-[12px] text-fg-muted">{k ? (shown?.stores[k] ?? 0) : ""}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === "sort"} title={s.sortLabel} onClose={() => setSheet(null)}>
        <div className="space-y-1">
          {(["best", "cheapest", "trust"] as Sort[]).map((k) => (
            <button key={k} onClick={() => (setSort(k), setSheet(null))} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-[14px] ${sort === k ? "bg-bg-muted font-semibold" : "hover:bg-bg-soft"}`} data-testid={`sort-${k}`}>
              {s.sortNames[k]} {sort === k && <Check className="size-4" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

/** Puts the "Ask Dalil to compare" banner across the grid after the 4th result. */
function FragmentWithBanner({ i, show, banner, children }: { i: number; show: boolean; banner: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {children}
      {show && i === 3 && <div className="col-span-2 sm:col-span-3 lg:col-span-4">{banner}</div>}
    </>
  );
}

function AskBanner({ s, onClick }: { s: Strings; onClick: () => void }) {
  return (
    <m.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileTap={{ scale: 0.99 }} onClick={onClick} className="flex w-full items-center gap-2 rounded-2xl bg-accent-soft px-3.5 py-3 text-start" data-testid="ask-banner">
      <Sparkles className="size-5 shrink-0 text-accent" />
      <span className="flex-1 text-[14px] font-medium">{s.notSure}</span>
      <span className="rounded-full bg-bg px-3 py-1 text-[12.5px] font-semibold shadow-sm">{s.tryAi}</span>
    </m.button>
  );
}

function PriceForm({ s, value, onApply }: { s: Strings; value: { min?: number; max?: number }; onApply: (v: { min?: number; max?: number }) => void }) {
  const [min, setMin] = useState(value.min?.toString() ?? "");
  const [max, setMax] = useState(value.max?.toString() ?? "");
  const num = (x: string) => (x.trim() && Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : undefined);
  return (
    <div className="space-y-3" data-testid="price-form">
      <div className="flex gap-2">
        <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder={s.minPrice} className="w-1/2 rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-fg" data-testid="price-min" />
        <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" placeholder={s.maxPrice} className="w-1/2 rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-fg" data-testid="price-max" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onApply({})} className="flex-1 rounded-xl border border-line py-2.5 text-[14px] font-medium">
          {s.clear}
        </button>
        <button onClick={() => onApply({ min: num(min), max: num(max) })} className="flex-1 rounded-xl bg-inv-bg py-2.5 text-[14px] font-semibold text-inv-fg" data-testid="price-apply">
          {s.apply}
        </button>
      </div>
    </div>
  );
}

/* ---------- Stores directory ---------- */

function StoresView({ s, lang, country, go, back, tab: tab0 }: CommonProps & { tab?: string }) {
  const { data, loading } = useJson<StoresResponse>(`/api/stores?country=${country}`);
  const [tab, setTab] = useState(tab0 ?? "all");
  const tabs: Array<[string, string]> = [
    ["all", s.tabAll],
    ["partners", s.tabPartners],
    ["marketplace", s.tabMarkets],
    ["local", s.tabLocal],
    ["services", s.tabServices],
  ];
  const list = (data?.stores ?? []).filter((x) => tab === "all" || (tab === "partners" ? x.partner : x.kind === tab));
  return (
    <div className="pb-24 pt-1" data-testid="stores-view">
      <div className="flex items-center gap-1">
        <button onClick={back} className="rounded-full p-2 hover:bg-bg-soft" aria-label={s.back}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" />
        </button>
        <h1 className="text-[22px] font-bold tracking-tight">{s.storesTitle}</h1>
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`relative shrink-0 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${tab === id ? "text-white" : "bg-bg-muted text-fg-soft"}`} data-testid={`tab-${id}`}>
            {tab === id && <m.span layoutId="stores-tab" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3" data-testid="store-list">
        {loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        {!loading && tab === "partners" && !list.length && <p className="rounded-2xl bg-bg-soft p-4 text-[13.5px] text-fg-soft">{s.partnersSoon}</p>}
        {list.map((st, i) => (
          <StoreCard key={st.id} st={st} s={s} lang={lang} i={i} onOpen={() => (st.nearMe ? go({ v: "services" }) : go({ v: "store", id: st.id }))} />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-bg-muted p-4">
        <div>
          <div className="text-[15px] font-semibold">{s.joinTitle}</div>
          <div className="text-[13px] text-fg-muted">{s.joinSub}</div>
        </div>
        <a href="/merchants" className="shrink-0 rounded-xl bg-inv-bg px-4 py-2.5 text-[14px] font-semibold text-inv-fg">
          {s.joinNow}
        </a>
      </div>
    </div>
  );
}

function StoreCard({ st, s, lang, i, onOpen }: { st: DirStore; s: Strings; lang: Lang; i: number; onOpen: () => void }) {
  return (
    <m.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 6) * 0.04 }}
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="flex w-full gap-3 rounded-2xl border border-line bg-bg p-3.5 text-start shadow-card"
      data-testid="store-card"
    >
      <StoreLogo st={st} size={48} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[15.5px] font-semibold">{st.name}</span>
          <TrustChip n={st.trustScore} s={s} />
          {st.partner && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">Dalil Partner</span>}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-fg-soft">{st.about[lang]}</span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-bg-muted px-2.5 py-1 text-[11.5px]">{st.regions[lang]}</span>
          {st.products != null && <span className="rounded-full bg-bg-muted px-2.5 py-1 text-[11.5px]">{s.products(st.products)}</span>}
        </span>
      </span>
    </m.button>
  );
}

/* ---------- One store ---------- */

function StoreView({ s, lang, country, go, back, onOpen, onAsk, id }: CommonProps & { id: string }) {
  const dir = useJson<StoresResponse>(`/api/stores?country=${country}`);
  const st = dir.data?.stores.find((x) => x.id === id);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const url = st?.source ? `/api/search?country=${country}&store=${st.source}&limit=48${q ? `&q=${encodeURIComponent(q)}` : ""}${cat ? `&category=${encodeURIComponent(cat)}` : ""}` : null;
  const res = useJson<SearchResponse>(url);
  const [cats, setCats] = useState<string[]>([]);
  useEffect(() => {
    if (res.data?.categories.length && !cats.length) setCats(res.data.categories);
  }, [res.data, cats.length]);
  return (
    <div className="pb-24" data-testid="store-view">
      <div className="-mx-4 h-24 bg-gradient-to-br from-accent-soft via-bg-soft to-bg" style={st ? { background: `linear-gradient(135deg, ${st.color}22, var(--bg-soft) 60%, var(--bg))` } : undefined}>
        <button onClick={back} className="m-2 rounded-full bg-bg/80 p-2 backdrop-blur" aria-label={s.back}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" />
        </button>
      </div>
      {!st ? (
        <div className="skeleton -mt-8 h-32 rounded-2xl" />
      ) : (
        <>
          <div className="-mt-8 flex items-end gap-3">
            <m.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[1.1rem] bg-bg p-1">
              <StoreLogo st={st} size={64} />
            </m.div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight">{st.name}</h1>
            <TrustChip n={st.trustScore} s={s} />
          </div>
          <p className="mt-1 text-[13.5px] text-fg-soft">{st.about[lang]}</p>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            {st.regions[lang]}
            {st.products != null ? ` · ${s.products(st.products)}` : ""}
            {st.ageMin != null ? ` · ${s.updatedAgo(st.ageMin)}` : ""}
          </p>
          <a href={st.url} target="_blank" rel="noopener noreferrer" onClick={() => track("visit", { store: st.name, url: st.url })} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-3 text-[14px] font-semibold text-inv-fg" data-testid="visit-store">
            {s.visitStore} <ExternalLink className="size-4" />
          </a>
          {st.source ? (
            <>
              <div className="mt-4">
                <SearchBox s={s} placeholder={s.searchIn(st.name)} value={q} onSubmit={setQ} testid="store-search" />
              </div>
              {cats.length > 1 && (
                <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
                  {["", ...cats].map((c) => (
                    <button key={c || "all"} onClick={() => setCat(c)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] ${cat === c ? "border-fg font-semibold" : "border-line text-fg-soft"}`}>
                      {c ? c.split(" / ")[lang === "ar" ? 1 : 0] ?? c : s.tabAll}
                    </button>
                  ))}
                </div>
              )}
              <div className={`mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 ${res.loading ? "opacity-60" : ""}`} data-testid="store-results">
                {!res.data && res.loading ? <TileSkeletons n={4} /> : (res.data?.offers ?? []).map((o, i) => <ProductTile key={o.id} o={o} s={s} onOpen={onOpen} i={i} />)}
              </div>
              {res.data && !res.data.offers.length && <p className="mt-6 text-center text-[13.5px] text-fg-muted">{s.noResults}</p>}
            </>
          ) : (
            <button onClick={() => onAsk(s.askInStore(st.name))} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent-soft py-3 text-[14px] font-semibold text-accent" data-testid="ask-store">
              <Sparkles className="size-4" /> {s.askInStore(st.name)}
            </button>
          )}
          <button onClick={() => go({ v: "stores" })} className="mt-6 w-full text-center text-[13px] text-fg-muted underline">
            {s.storesTitle}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- Services + near me ---------- */

const SERVICES: Array<{ id: keyof Strings["svc"]; Icon: typeof House; any: string }> = [
  { id: "topup", Icon: CreditCard, any: "top up|recharge|شحن رصيد|رصيد" },
  { id: "bills", Icon: Receipt, any: "bill|bills|فاتورة|فواتير|electricity|كهرباء" },
  { id: "gift", Icon: Gift, any: "gift card|itunes|google play|كارت|بطاقة" },
  { id: "stars", Icon: Star, any: "telegram|stars|تليجرام|نجوم" },
  { id: "dev", Icon: Code, any: "website|app|software|coding|برمجة|تطبيق|موقع" },
  { id: "design", Icon: Palette, any: "design|logo|تصميم" },
  { id: "repair", Icon: Hammer, any: "repair|fix|صيانة|تصليح" },
  { id: "food", Icon: UtensilsCrossed, any: "food|meal|restaurant|اكل|مطعم|وجبة" },
];

function ServicesView({ s, country, go, back, coords, onLocate }: CommonProps & { coords?: { lat: number; lon: number } | null; onLocate: () => void }) {
  const url = `/api/local-shops?country=${country}${coords ? `&lat=${coords.lat}&lon=${coords.lon}` : ""}`;
  const shops = useJson<{ shops: LocalShop[]; locatedBy?: "gps" | "ip" | null }>(url);
  return (
    <div className="pb-24 pt-1" data-testid="services-view">
      <div className="flex items-center gap-1">
        <button onClick={back} className="rounded-full p-2 hover:bg-bg-soft" aria-label={s.back}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" />
        </button>
        <h1 className="text-[22px] font-bold tracking-tight">{s.servicesTitle}</h1>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2.5" data-testid="service-tiles">
        {SERVICES.map(({ id, Icon, any }, i) => (
          <m.button
            key={id}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => go({ v: "search", q: "", any, title: s.svc[id] })}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-bg-soft px-1 py-3"
            data-testid={`svc-${id}`}
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-bg text-fg shadow-sm">
              <Icon className="size-5" strokeWidth={1.8} />
            </span>
            <span className="text-center text-[11.5px] leading-tight">{s.svc[id]}</span>
          </m.button>
        ))}
      </div>

      <SectionTitle
        action={
          <button onClick={onLocate} className="flex items-center gap-1 text-[13px] font-medium text-accent" data-testid="use-location">
            <LocateFixed className="size-4" /> {s.useLocation}
          </button>
        }
      >
        {s.nearYou}
      </SectionTitle>
      {shops.loading && !shops.data ? (
        <div className="flex gap-3">
          <div className="skeleton h-64 w-[15.5rem] rounded-2xl" />
          <div className="skeleton h-64 w-[15.5rem] rounded-2xl" />
        </div>
      ) : shops.data?.shops.length ? (
        <ShopCards shops={shops.data.shops} s={s} locatedBy={shops.data.locatedBy ?? undefined} />
      ) : (
        <p className="rounded-2xl bg-bg-soft p-4 text-[13.5px] text-fg-soft">{s.noShopsHere}</p>
      )}
    </div>
  );
}

/* ---------- Product page ---------- */

interface ProductResponse {
  offer: Offer;
  images: string[];
  description?: string;
  title_ar?: string;
  title_en?: string;
  brand?: string;
  model?: string;
  category?: string;
  stock?: number;
  similar: Offer[];
}

function Gallery({ images, alt, store }: { images: string[]; alt: string; store: string }) {
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const list = images.length ? images : [""];
  return (
    <div className="relative -mx-4">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        data-testid="gallery"
      >
        {list.map((src, i) => (
          <div key={i} className="aspect-square w-full shrink-0 snap-center bg-white">
            <SmartImage src={src || undefined} alt={`${alt} ${i + 1}`} className="size-full p-4" fallbackLabel={store} />
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden>
          {list.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === at ? "w-4 bg-fg" : "w-1.5 bg-fg/30"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductView({ s, lang, country, go, back, onAsk, id, actions }: CommonProps & { id: string; actions: ShopActions }) {
  const { data, loading, error } = useJson<ProductResponse>(`/api/product?id=${encodeURIComponent(id)}&country=${country}`);
  const [copied, setCopied] = useState(false);
  const [more, setMore] = useState(false);
  const o = data?.offer;
  const share = async () => {
    const url = `${window.location.origin}/?v=p&id=${encodeURIComponent(id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: o?.title ?? "Dalil Pi", text: o ? `${o.title} · ${fmt(o.total)} π` : undefined, url });
        return;
      }
    } catch {
      /* fall back to copy */
    }
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const store = o ? o.store.split(" · ")[0] : "";
  return (
    <div className="pb-24" data-testid="product-view">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-bg/90 px-2 py-1.5 backdrop-blur">
        <button onClick={back} className="rounded-full p-2 hover:bg-bg-soft" aria-label={s.back}>
          <ArrowLeft className="size-5 rtl:-scale-x-100" />
        </button>
        <span className="truncate px-2 text-[14px] font-semibold">{store}</span>
        <button onClick={share} className="flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-medium hover:bg-bg-soft" data-testid="share">
          <Share2 className="size-4" /> {copied ? s.linkCopied : s.share}
        </button>
      </div>
      {loading && !data ? (
        <div className="space-y-3">
          <div className="skeleton -mx-4 aspect-square" />
          <div className="skeleton h-5 w-3/4 rounded" />
          <div className="skeleton h-8 w-1/3 rounded" />
        </div>
      ) : !o ? (
        <div className="mt-16 text-center text-[14px] text-fg-muted" data-testid="product-gone">
          {error ? s.gone : null}
        </div>
      ) : (
        <>
          <Gallery images={data!.images} alt={o.title} store={store} />
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
            {LOGO_BY_NAME[store] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={LOGO_BY_NAME[store]} alt="" className="size-5 rounded-md bg-white object-contain ring-1 ring-line" />
            )}
            <span className="font-semibold">{o.store}</span>
            {data!.brand && <span className="rounded-full bg-bg-muted px-2 py-0.5">{data!.brand}{data!.model ? ` · ${data!.model}` : ""}</span>}
            {data!.stock != null && data!.stock > 0 && <span className="rounded-full bg-ok-soft px-2 py-0.5 font-medium text-ok">{s.inStockLeft(data!.stock)}</span>}
            <span className="rounded-full border border-line px-2 py-0.5">✓ {s.shipsTo(countryLabel(country, lang))}</span>
          </div>
          <div className="mt-3">
            <OfferDetail
              o={o}
              s={s}
              lang={lang}
              hideImage
              onOrder={actions.onOrder}
              ordersLeft={actions.ordersLeft}
              onWatch={actions.onWatch}
              onCart={actions.onCart}
              inCart={actions.inCart}
              onAskShop={actions.onAskShop}
              onAsk={onAsk}
            />
          </div>

          {!!o.twins?.length && (
            <section className="mt-5 rounded-2xl bg-bg-soft p-3" data-testid="twins">
              <h2 className="mb-1.5 text-[15px] font-semibold">{s.sameElsewhere}</h2>
              {o.twins.map((tw) => {
                const st = tw.store.split(" · ")[0];
                const diff = o.total - tw.total;
                return (
                  <button key={tw.ref} onClick={() => go({ v: "p", id: tw.ref })} className="flex w-full items-center gap-2 border-t border-line py-2 text-start first:border-0">
                    {LOGO_BY_NAME[st] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={LOGO_BY_NAME[st]} alt="" className="size-6 rounded-md bg-white object-contain" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{tw.store}</span>
                    {diff > 0.5 && <span className="rounded-full bg-ok px-1.5 py-0.5 text-[10.5px] font-bold text-white">{s.cheaperBy(`${fmt(diff)} π`)}</span>}
                    <PiPrice value={tw.total} className="text-[14px]" />
                  </button>
                );
              })}
            </section>
          )}

          {data!.description && (
            <section className="mt-5">
              <h2 className="mb-1 text-[15px] font-semibold">{s.description}</h2>
              <p className={`whitespace-pre-line text-[13.5px] leading-relaxed text-fg-soft ${more ? "" : "line-clamp-4"}`} dir="auto">
                {data!.description}
              </p>
              {data!.description.length > 220 && !more && (
                <button onClick={() => setMore(true)} className="mt-1 text-[13px] font-medium text-accent">
                  {s.readMore}
                </button>
              )}
            </section>
          )}

          {!!data!.similar.length && (
            <section className="mt-6">
              <h2 className="mb-2.5 text-[17px] font-bold tracking-tight">{s.similar}</h2>
              <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1" data-testid="similar">
                {data!.similar.map((x, i) => (
                  <ProductTile key={x.id} o={x} s={s} i={i} wide onOpen={(y) => (y.ref ? go({ v: "p", id: y.ref }) : undefined)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Scroll the main pane to the top whenever the view changes. */
export function useScrollTopOn(key: string, ref: React.RefObject<HTMLElement | null>) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.scrollTo({ top: 0 });
  }, [key, ref]);
}
