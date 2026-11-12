"use client";

import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  CreditCard,
  Headphones,
  House,
  MapPin,
  Search,
  Shirt,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  SprayCan,
  Store,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { countryLabel, type Strings } from "@/lib/i18n";
import { STORE_DIRECTORY, type StoreEntry } from "@/lib/stores";
import type { Lang, Offer } from "@/lib/types";
import { BottomSheet, OfferDetail, SmartImage } from "./cards";
import dynamic from "next/dynamic";
// Views other than Home load on first use (ShopMore.tsx), keeping the first page light.
const loadingView = () => <div className="px-4 pt-4"><TileSkeletons n={4} /></div>;
const SearchView = dynamic(() => import("./ShopMore").then((x) => x.SearchView), { ssr: false, loading: loadingView });
const StoresView = dynamic(() => import("./ShopMore").then((x) => x.StoresView), { ssr: false, loading: loadingView });
const StoreView = dynamic(() => import("./ShopMore").then((x) => x.StoreView), { ssr: false, loading: loadingView });
const ServicesView = dynamic(() => import("./ShopMore").then((x) => x.ServicesView), { ssr: false, loading: loadingView });
const ProductView = dynamic(() => import("./ShopMore").then((x) => x.ProductView), { ssr: false, loading: loadingView });


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
export function useJson<T>(url: string | null): { data?: T; loading: boolean; error?: string; reload: () => void } {
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

export interface SearchResponse {
  offers: Offer[];
  total: number;
  stores: Record<string, number>;
  categories: string[];
  ms: number;
}
export interface StoresResponse {
  stores: Array<StoreEntry & { products: number | null; totalProducts: number | null; ageMin: number | null; trustScore: number | null }>;
}
export type DirStore = StoresResponse["stores"][number];

export const STORE_NAMES: Record<string, string> = { pcm: "Pi Chain Mall", salla: "Salla Shop Mall", pkt: "Piketplace", gtp: "Global Trade Pi" };

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

export const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : n < 1000 ? 1 : 0 });

export function PiPrice({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`font-semibold tabular-nums ${className}`} dir="ltr">
      {fmt(value)} <span className="text-gold">π</span>
    </span>
  );
}

export function TrustChip({ n, s, compact }: { n?: number | null; s: Strings; compact?: boolean }) {
  if (n == null) return null;
  const tone = n >= 60 ? "bg-ok-soft text-ok" : n >= 40 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-danger/10 text-danger";
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${tone}`} title={`${s.trust} ${n}/100`}>
      <ShieldCheck className="size-3" /> {n}
      {!compact && <span className="font-medium"> {s.trust}</span>}
    </span>
  );
}

export function StoreLogo({ st, size = 44 }: { st: Pick<StoreEntry, "color" | "mono" | "name" | "logo">; size?: number }) {
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

export const LOGO_BY_NAME: Record<string, string | undefined> = Object.fromEntries(STORE_DIRECTORY.filter((d) => d.source && d.logo).map((d) => [d.name, d.logo]));

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

export function TileSkeletons({ n = 4, wide }: { n?: number; wide?: boolean }) {
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

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center justify-between">
      <h2 className="text-[17px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function SearchBox({ s, value, onSubmit, autoFocus, placeholder, onBack, testid = "shop-search" }: { s: Strings; value?: string; onSubmit: (q: string) => void; autoFocus?: boolean; placeholder?: string; onBack?: () => void; testid?: string }) {
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

export interface CommonProps {
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
  // The owner's row may not reach this country (a store limited to some countries):
  // then the same categories from any store here, then whatever is sold here.
  const none = (r: { data?: SearchResponse | null }) => !!r.data && r.data.offers.length === 0;
  const featuredAny = useJson<SearchResponse>(fe && none(featuredMain) ? `/api/search?country=${country}&limit=12${fe.cats ? `&cat=${encodeURIComponent(fe.cats)}` : ""}` : null);
  const featuredLocal = useJson<SearchResponse>(none(featuredMain) && none(featuredAny) ? `/api/search?country=${country}&limit=12` : null);
  const fallback = !none(featuredMain) ? "main" : !featuredAny.data ? "wait" : !none(featuredAny) ? "any" : "local";
  const featured = { data: fallback === "main" ? featuredMain.data : fallback === "any" ? featuredAny.data : fallback === "local" ? featuredLocal.data : null };
  const feLocal = fallback === "any" || fallback === "local";
  const deals = useJson<SearchResponse>(`/api/search?deals=1&limit=12&country=${country}`);
  // Salla Shop Mall's own row (every category), unless the owner's row above is already all of Salla.
  const sallaAll = useJson<SearchResponse>(fe && !(fe.store === "salla" && !fe.cats) ? `/api/search?country=${country}&store=salla&limit=24` : null);
  const shownAbove = new Set((featured.data?.offers ?? []).map((o) => o.url));
  const sallaRow = (sallaAll.data?.offers ?? []).filter((o) => !shownAbove.has(o.url)).slice(0, 12);
  const stores = useJson<StoresResponse>(`/api/stores?country=${country}`);
  const sallaStore = (stores.data?.stores ?? []).find((x) => x.source === "salla");
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

      {sallaRow.length >= 3 && (
        <>
          <SectionTitle
            action={
              <button onClick={() => go({ v: "search", q: "", store: "salla", title: STORE_NAMES.salla })} className="text-[13px] font-medium text-accent" data-testid="salla-all">
                {s.seeAll}
              </button>
            }
          >
            <span className="flex items-center gap-1.5">
              {sallaStore?.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sallaStore.logo} alt="" className="size-5 rounded-md bg-white object-contain ring-1 ring-line" />
              )}
              {lang === "ar" ? "من سلة شوب" : "From Salla Shop"}
            </span>
          </SectionTitle>
          <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1" data-testid="home-salla">
            {sallaRow.map((o, i) => <ProductTile key={o.id} o={o} s={s} onOpen={onOpen} i={i} wide />)}
          </div>
        </>
      )}

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
