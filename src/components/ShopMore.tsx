"use client";

import { m } from "framer-motion";
import {
  X,
  ArrowLeft,
  Check,
  ChevronDown,
  Code,
  CreditCard,
  ExternalLink,
  Gift,
  Hammer,
  House,
  Loader2,
  LocateFixed,
  Palette,
  Receipt,
  Search,
  Share2,
  Sparkles,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { countryLabel, type Strings } from "@/lib/i18n";
import { track } from "@/lib/track";
import type { Lang, LocalShop, Offer, SallaApp } from "@/lib/types";
import { BottomSheet, CompareTable, OfferDetail, SmartImage } from "./cards";
import { SallaAppCards, ShopCards } from "./Shops";
import { fmt, LOGO_BY_NAME, PiPrice, STORE_NAMES, type DirStore, type SearchResponse, type StoresResponse, ProductTile, SearchBox, SectionTitle, StoreLogo, TileSkeletons, TrustChip, useJson, type CommonProps, type ShopActions, type View } from "./Shop";

/* Shop views other than Home: loaded when first opened (not with the first page). */

/* ---------- Search results ---------- */

type Sort = "best" | "cheapest" | "trust";

const QUICK_PRICES: Array<{ min?: number; max?: number }> = [{ max: 100 }, { min: 100, max: 500 }, { min: 500, max: 2000 }, { min: 2000 }];

export function SearchView({ s, lang, country, go, back, onOpen, onAsk, view }: CommonProps & { view: Extract<View, { v: "search" }> }) {
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
      <SearchBox s={s} country={country} value={view.q || view.title} onBack={back} onSubmit={(q) => go({ v: "search", q })} />
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
      <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4" data-testid="price-quick">
        {QUICK_PRICES.map((r) => {
          const on = price.min === r.min && price.max === r.max;
          const label = r.min == null ? s.priceUnder(r.max!) : r.max == null ? s.priceOver(r.min) : s.priceBetween(r.min, r.max);
          return (
            <button key={label} onClick={() => setPrice(on ? {} : { min: r.min, max: r.max })} className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${on ? "bg-accent text-white" : "bg-bg-soft text-fg-soft"}`}>
              {label}
            </button>
          );
        })}
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
          {(price.min != null || price.max != null || store || stock) && (
            <button onClick={() => (setPrice({}), setStore(""), setStock(false))} className="rounded-full border border-line px-4 py-2 text-[13px] font-medium" data-testid="clear-filters">
              {s.clearFilters}
            </button>
          )}
          {(view.q ?? "").trim().split(/\s+/).length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[13px]" data-testid="try-words">
              <span className="text-fg-muted">{s.tryWords}</span>
              {[...new Set((view.q ?? "").trim().split(/\s+/).filter((w) => w.length > 2))].slice(0, 4).map((w) => (
                <button key={w} onClick={() => go({ v: "search", q: w })} className="rounded-full bg-bg-soft px-3 py-1" dir="auto">
                  {w}
                </button>
              ))}
            </div>
          )}
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

export function StoresView({ s, lang, country, go, back, tab: tab0 }: CommonProps & { tab?: string }) {
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

export function StoreView({ s, lang, country, go, back, onOpen, onAsk, id }: CommonProps & { id: string }) {
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

type AppType = SallaApp["type"];
const APP_TYPES: AppType[] = ["restaurant", "service", "health", "delivery", "mall_service", "telegram"];

/** Salla apps directory with type chips (only the types that have entries in the country). */
function SallaAppsSection({ s, lang, country }: { s: Strings; lang: Lang; country: string }) {
  const [type, setType] = useState<AppType | null>(null);
  const [more, setMore] = useState(false);
  const all = useJson<{ services: SallaApp[]; types: Partial<Record<AppType, number>>; total: number }>(`/api/services?country=${country}&limit=60`);
  const one = useJson<{ services: SallaApp[]; total: number }>(type ? `/api/services?country=${country}&type=${type}&limit=60` : null);
  const types = APP_TYPES.filter((t) => (all.data?.types?.[t] ?? 0) > 0);
  const list = (type ? one.data?.services : all.data?.services) ?? [];
  const loading = type ? one.loading && !one.data : all.loading && !all.data;
  if (!loading && !all.data?.total) return null;
  return (
    <section data-testid="salla-apps-section">
      <SectionTitle>{s.sallaApps}</SectionTitle>
      <p className="-mt-1.5 mb-2.5 text-[12.5px] text-fg-muted">{s.sallaAppsSub}</p>
      {types.length > 1 && (
        <div className="-mx-4 mb-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1" data-testid="salla-app-types">
          {[null, ...types].map((t) => (
            <button
              key={t ?? "all"}
              onClick={() => {
                setType(t);
                setMore(false);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium ${type === t ? "bg-inv-bg text-inv-fg" : "bg-bg-soft"}`}
              data-testid={`app-type-${t ?? "all"}`}
            >
              {t ? `${s.svcType[t]} · ${all.data?.types?.[t] ?? 0}` : s.svcType.all}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
      ) : list.length ? (
        <>
          <SallaAppCards apps={more ? list : list.slice(0, 8)} s={s} lang={lang} />
          {!more && list.length > 8 && (
            <button onClick={() => setMore(true)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-2xl bg-bg-soft py-2.5 text-[13px] font-medium" data-testid="salla-apps-more">
              <ChevronDown className="size-4" /> {list.length - 8}+
            </button>
          )}
        </>
      ) : (
        <p className="rounded-2xl bg-bg-soft p-4 text-[13.5px] text-fg-soft">{s.noSallaApps}</p>
      )}
    </section>
  );
}

export function ServicesView({ s, lang, country, go, back, coords, onLocate }: CommonProps & { coords?: { lat: number; lon: number } | null; onLocate: () => void }) {
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

      <SallaAppsSection s={s} lang={lang} country={country} />

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

/** Full-screen photo: tap to zoom 2.5× at that spot, drag to look around, ✕ or Back to close. */
function ZoomView({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [big, setBig] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-black/95" role="dialog" aria-label={alt} data-testid="zoom">
      <div ref={box} className="size-full overflow-auto" style={{ touchAction: big ? "pan-x pan-y" : "manipulation" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onClick={(e) => {
            const el = box.current;
            const r = e.currentTarget.getBoundingClientRect();
            const fx = (e.clientX - r.left) / r.width;
            const fy = (e.clientY - r.top) / r.height;
            setBig((b) => !b);
            // Keep the tapped spot under the finger after zooming in.
            requestAnimationFrame(() => el && !big && el.scrollTo({ left: fx * el.scrollWidth - el.clientWidth / 2, top: fy * el.scrollHeight - el.clientHeight / 2 }));
          }}
          className={`m-auto max-w-none object-contain transition-[width] duration-200 ${big ? "w-[250%] cursor-zoom-out" : "h-full w-full cursor-zoom-in"}`}
        />
      </div>
      <button onClick={onClose} className="absolute end-4 top-4 rounded-full bg-white/15 p-2.5 text-white backdrop-blur" aria-label="Close">
        <X className="size-5" />
      </button>
    </m.div>
  );
}

function Gallery({ images, alt, store }: { images: string[]; alt: string; store: string }) {
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
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
          <div key={i} className="aspect-square w-full shrink-0 snap-center bg-white" onClick={() => src && setZoom(src)}>
            <SmartImage src={src || undefined} alt={`${alt} ${i + 1}`} className="size-full cursor-zoom-in p-4" fallbackLabel={store} />
          </div>
        ))}
      </div>
      {zoom && <ZoomView src={zoom} alt={alt} onClose={() => setZoom(null)} />}
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

export function ProductView({ s, lang, country, go, back, onAsk, id, actions }: CommonProps & { id: string; actions: ShopActions }) {
  const { data, loading, error } = useJson<ProductResponse>(`/api/product?id=${encodeURIComponent(id)}&country=${country}`);
  const [copied, setCopied] = useState(false);
  const [more, setMore] = useState(false);
  const [comparing, setComparing] = useState(false);
  const o = data?.offer;
  const share = async () => {
    // The public product page (readable by search engines and link previews); it opens the app too.
    const url = `${window.location.origin}/p/${encodeURIComponent(id)}`;
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
          {/* Opening a product: the photo grows into place (the tile → page feel). */}
          <m.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
            <Gallery images={data!.images} alt={o.title} store={store} />
          </m.div>
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
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold tracking-tight">{s.similar}</h2>
                <button onClick={() => setComparing(true)} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12.5px] font-medium" data-testid="compare-similar">
                  {s.compareSimilar}
                </button>
              </div>
              <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1" data-testid="similar">
                {data!.similar.map((x, i) => (
                  <ProductTile key={x.id} o={x} s={s} i={i} wide onOpen={(y) => (y.ref ? go({ v: "p", id: y.ref }) : undefined)} />
                ))}
              </div>
            </section>
          )}
          <BottomSheet open={comparing} title={s.compareSimilar} onClose={() => setComparing(false)}>
            {comparing && <CompareTable offers={[data!.offer, ...data!.similar.slice(0, 2)]} s={s} lang={lang} />}
          </BottomSheet>
        </>
      )}
    </div>
  );
}

