"use client";

import { BarChart3, Check, Eye, EyeOff, LogOut, Megaphone, RefreshCw, Search, Settings, Store, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { STORE_DIRECTORY } from "@/lib/stores";

/**
 * Owner panel (/admin): password login (hash in the database), traffic and revenue, store
 * visibility and refresh, merchant approvals, missed searches, and site settings.
 */

type Tab = "overview" | "stores" | "merchants" | "searches" | "settings";
interface Stats {
  days: number;
  totals: { visits: number; orders: number; misses: number };
  stores: Array<{ store: string; visits: number; orders: number; last7: number }>;
  daily: Array<{ day: string; visits: number; orders: number }>;
  topProducts: Array<{ store: string; title: string; url: string; visits: number; orders: number }>;
  misses: Array<{ q: string; country: string; n: number; last_at: string }>;
  countries: Array<{ country: string; n: number }>;
  catalog: Array<{ source: string; name: string; products: number; total: number; ageMin: number | null; ok: boolean | null }>;
}
interface Overview {
  users: number;
  newUsers7: number;
  activePacks: number;
  paymentsCompleted: number;
  revenuePi: number;
  orders30: number;
  merchantsPending: number;
}
interface SiteSettings {
  featured: { store: string; cats: string; title_en: string; title_ar: string };
  hidden_stores: string[];
  announcement: { on: boolean; en: string; ar: string };
}
interface Merchant {
  id: string;
  name: string;
  kind: string;
  country: string;
  city: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  items: { title: string; price: number }[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

const TOKEN = "dalil-admin-token";
const LOGO: Record<string, string | undefined> = Object.fromEntries(STORE_DIRECTORY.map((d) => [d.name, d.logo]));
const SOURCE_OF: Record<string, string> = { pcm: "pcm", salla: "salla", gtp: "gtp", piketplace: "pkt" };
const CAT_LABEL: Record<string, string> = {
  phones: "موبايلات", headphones: "سماعات", computers: "كمبيوتر", tv_audio: "إلكترونيات", appliances: "أجهزة منزلية", home: "البيت", fashion: "ملابس", shoes: "أحذية",
  beauty: "عناية", perfume: "عطور", grocery: "سوبر ماركت", kids: "أطفال", sports: "رياضة", vehicles: "مركبات", topup: "شحن رصيد", gift_cards: "كروت هدايا", services: "خدمات", collectibles: "مقتنيات",
};
const n = (x: number) => x.toLocaleString("en-US");

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    try {
      setToken(localStorage.getItem(TOKEN));
    } catch {}
  }, []);

  const api = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) {
        try {
          localStorage.removeItem(TOKEN);
        } catch {}
        setToken(null);
      }
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j as T;
    },
    [token],
  );

  if (!token)
    return (
      <Login
        onDone={(t, s) => {
          setToken(t);
          setSetup(s);
          setTab("overview");
          try {
            localStorage.setItem(TOKEN, t);
          } catch {}
        }}
      />
    );
  if (setup) return <ChoosePassword api={api} onDone={() => setSetup(false)} first />;

  const tabs: Array<[Tab, string, typeof Store]> = [
    ["overview", "نظرة عامة", BarChart3],
    ["stores", "المتاجر", Store],
    ["merchants", "التجار", Users],
    ["searches", "البحث", Search],
    ["settings", "الإعدادات", Settings],
  ];
  return (
    <div className="min-h-dvh bg-bg" data-testid="admin">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-xl bg-inv-bg text-[15px] font-bold text-inv-fg">π</span>
          <div className="flex-1">
            <div className="text-[15px] font-bold leading-tight">دليل باي</div>
            <div className="text-[11px] text-fg-muted">لوحة التحكم</div>
          </div>
          <Link href="/" className="rounded-full border border-line px-3 py-1.5 text-[12px]">الموقع</Link>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(TOKEN);
              } catch {}
              setToken(null);
            }}
            className="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[12px]"
            data-testid="admin-logout"
          >
            <LogOut className="size-3.5 rtl:-scale-x-100" /> خروج
          </button>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${tab === id ? "bg-accent text-white" : "bg-bg-muted text-fg-soft"}`} data-testid={`atab-${id}`}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        {tab === "overview" && <OverviewTab api={api} go={setTab} />}
        {tab === "stores" && <StoresTab api={api} />}
        {tab === "merchants" && <MerchantsTab api={api} />}
        {tab === "searches" && <SearchesTab api={api} />}
        {tab === "settings" && <SettingsTab api={api} />}
      </main>
    </div>
  );
}

type Api = <T>(url: string, init?: RequestInit) => Promise<T>;

function useData<T>(api: Api, url: string) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    api<T>(url)
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, [api, url, n]);
  return { data, err, reload: () => setN((x) => x + 1) };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-bg p-4 shadow-card ${className}`}>{children}</div>;
}
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="text-[12px] text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-muted">{hint}</div>}
    </Card>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 text-[16px] font-bold first:mt-0">{children}</h2>;
}
function Logo({ name, size = 36 }: { name: string; size?: number }) {
  return LOGO[name] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={LOGO[name]} alt="" className="shrink-0 rounded-xl bg-white object-contain ring-1 ring-line" style={{ width: size, height: size }} />
  ) : (
    <span className="shrink-0 rounded-xl bg-bg-muted" style={{ width: size, height: size }} />
  );
}

/* ---------- login ---------- */

function Login({ onDone }: { onDone: (token: string, setup: boolean) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [first, setFirst] = useState<boolean | null>(null);
  useEffect(() => {
    document.documentElement.dir = "rtl";
    fetch("/api/admin/login")
      .then((r) => r.json())
      .then((j) => setFirst(!j.passwordSet))
      .catch(() => {});
  }, []);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-soft p-4">
      <form
        className="w-full max-w-sm rounded-3xl border border-line bg-bg p-6 shadow-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
            const j = await r.json();
            if (!r.ok) throw new Error(r.status === 401 ? "الباسورد غلط" : j.error || `HTTP ${r.status}`);
            onDone(j.token, j.setup);
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-inv-bg text-xl font-bold text-inv-fg">π</span>
        <h1 className="mt-3 text-center text-xl font-bold">لوحة تحكم دليل باي</h1>
        <p className="mt-1 text-center text-[13px] text-fg-muted">{first ? "أول مرة: ادخل بقيمة CRON_SECRET، وبعدها هتختار باسورد." : "ادخل الباسورد."}</p>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="الباسورد" className="mt-4 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-fg" dir="ltr" data-testid="admin-password" />
        {err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
        <button disabled={busy || !pw} className="mt-4 w-full rounded-xl bg-inv-bg py-2.5 text-[15px] font-semibold text-inv-fg disabled:opacity-50" data-testid="admin-login">
          {busy ? "…" : "دخول"}
        </button>
      </form>
    </main>
  );
}

function ChoosePassword({ api, onDone, first }: { api: Api; onDone: () => void; first?: boolean }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState("");
  const form = (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (a.length < 8) return setMsg("لازم 8 حروف على الأقل");
        if (a !== b) return setMsg("الباسوردين مش زي بعض");
        try {
          await api("/api/admin/password", { method: "POST", body: JSON.stringify({ password: a }) });
          setMsg("✓ اتحفظ");
          setA("");
          setB("");
          onDone();
        } catch (e) {
          setMsg((e as Error).message);
        }
      }}
    >
      <input type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="باسورد جديد (8 حروف أو أكتر)" className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-fg" dir="ltr" data-testid="new-password" />
      <input type="password" value={b} onChange={(e) => setB(e.target.value)} placeholder="اكتبه تاني" className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 outline-none focus:border-fg" dir="ltr" data-testid="new-password2" />
      {msg && <p className="text-[13px]">{msg}</p>}
      <button className="w-full rounded-xl bg-inv-bg py-2.5 font-semibold text-inv-fg" data-testid="save-password">
        حفظ الباسورد
      </button>
    </form>
  );
  if (!first) return form;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-soft p-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-bg p-6 shadow-card">
        <h1 className="text-center text-xl font-bold">اختار باسورد للوحة التحكم</h1>
        <p className="mb-4 mt-1 text-center text-[13px] text-fg-muted">هيتحفظ في قاعدة البيانات مشفّر (مش النص نفسه).</p>
        {form}
      </div>
    </main>
  );
}

/* ---------- overview ---------- */

function OverviewTab({ api, go }: { api: Api; go: (t: Tab) => void }) {
  const ov = useData<Overview>(api, "/api/admin/overview");
  const st = useData<Stats>(api, "/api/admin/stats?days=30");
  const max = Math.max(1, ...(st.data?.daily ?? []).map((d) => d.visits + d.orders));
  return (
    <div data-testid="admin-overview">
      {(ov.err || st.err) && <p className="mb-3 text-sm text-danger">{ov.err || st.err}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="admin-totals">
        <Stat label="المستخدمين" value={n(ov.data?.users ?? 0)} hint={`+${ov.data?.newUsers7 ?? 0} آخر 7 أيام`} />
        <Stat label="باقات شغالة" value={n(ov.data?.activePacks ?? 0)} />
        <Stat label="الإيراد" value={`${n(ov.data?.revenuePi ?? 0)} π`} hint={`${ov.data?.paymentsCompleted ?? 0} عملية دفع`} />
        <Stat label="طلبات (30 يوم)" value={n(ov.data?.orders30 ?? 0)} />
        <Stat label="زيارات للمتاجر" value={n(st.data?.totals.visits ?? 0)} hint="آخر 30 يوم" />
        <Stat label="طلبات اتبعتت" value={n(st.data?.totals.orders ?? 0)} hint="آخر 30 يوم" />
        <Stat label="بحث بدون نتيجة" value={n(st.data?.totals.misses ?? 0)} />
        <button onClick={() => go("merchants")} className="text-start">
          <Stat label="تجار مستنيين موافقة" value={n(ov.data?.merchantsPending ?? 0)} hint="اضغط للمراجعة" />
        </button>
      </div>
      <H>الزيارات والطلبات كل يوم</H>
      <Card>
        <div className="flex h-40 gap-[3px]" dir="ltr" data-testid="admin-chart">
          {(st.data?.daily ?? []).map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.visits} زيارة، ${d.orders} طلب`}>
              <div className="rounded-t-sm bg-accent" style={{ height: `${(d.orders / max) * 100}%` }} />
              <div className="bg-fg/25" style={{ height: `${(d.visits / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">رمادي = زيارات · بنفسجي = طلبات</p>
      </Card>
      {!!st.data?.countries.length && (
        <>
          <H>منين الزوار</H>
          <div className="flex flex-wrap gap-2">
            {st.data.countries.map((c) => (
              <span key={c.country} className="rounded-full bg-bg-muted px-3 py-1 text-sm">
                {c.country} · {c.n}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- stores ---------- */

function StoresTab({ api }: { api: Api }) {
  const st = useData<Stats>(api, "/api/admin/stats?days=30");
  const set = useData<SiteSettings>(api, "/api/admin/settings");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const hidden = new Set(set.data?.hidden_stores ?? []);
  const toggle = async (id: string) => {
    const next = hidden.has(id) ? [...hidden].filter((x) => x !== id) : [...hidden, id];
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ hidden_stores: next }) });
    set.reload();
  };
  const refresh = async (source: string) => {
    setBusy(source);
    try {
      await api("/api/admin/refresh?source=" + source, { method: "POST" });
      st.reload();
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="space-y-3" data-testid="admin-stores">
      <p className="text-[13px] text-fg-muted">إخفاء متجر بيشيله من البحث ودليل المتاجر وصفحات المنتجات خلال دقايق. التحديث بيقرا منتجاته من جديد دلوقتي.</p>
      {STORE_DIRECTORY.map((d) => {
        const src = SOURCE_OF[d.id];
        const cat = st.data?.catalog.find((c) => c.source === src);
        const traffic = st.data?.stores.find((x) => x.store === d.name);
        const off = hidden.has(d.id);
        return (
          <Card key={d.id} className={off ? "opacity-60" : ""}>
            <div className="flex flex-wrap items-center gap-3" data-testid={`admin-store-${d.id}`}>
              <Logo name={d.name} size={44} />
              <div className="min-w-0 flex-1 basis-40">
                <div className="truncate font-semibold">{d.name}</div>
                <div className="text-[12px] text-fg-muted">
                  {cat ? `${n(cat.total)} منتج · ${cat.ok === false ? "⚠️ آخر تحديث فشل" : cat.ageMin == null ? "لسه" : `اتحدث من ${cat.ageMin} دقيقة`}` : d.regions.ar}
                  {traffic ? ` · ${traffic.visits} زيارة · ${traffic.orders} طلب` : ""}
                </div>
              </div>
              <div className="flex w-full justify-end gap-2 sm:w-auto">
              {src && (
                <button onClick={() => refresh(src)} disabled={!!busy} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] disabled:opacity-50" data-testid={`refresh-${src}`}>
                  <RefreshCw className={`size-3.5 ${busy === src ? "animate-spin" : ""}`} /> تحديث
                </button>
              )}
              <button onClick={() => toggle(d.id)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${off ? "bg-danger/10 text-danger" : "bg-ok-soft text-ok"}`} data-testid={`toggle-${d.id}`}>
                {off ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {off ? "مخفي" : "ظاهر"}
              </button>
              </div>
            </div>
            {traffic && (
              <button
                onClick={async () => {
                  const txt = `Dalil Pi → ${d.name}: in the last 30 days Dalil Pi sent you ${traffic.visits} visitors and ${traffic.orders} orders.\nدليل باي ← ${d.name}: في آخر 30 يوم دليل باي بعتلكم ${traffic.visits} زيارة و${traffic.orders} طلب.`;
                  await navigator.clipboard?.writeText(txt).catch(() => {});
                  setCopied(d.id);
                  setTimeout(() => setCopied(""), 1500);
                }}
                className="mt-2 text-[12px] font-medium text-accent"
              >
                {copied === d.id ? "✓ اتنسخ" : "انسخ تقرير للمتجر"}
              </button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- merchants ---------- */

function MerchantsTab({ api }: { api: Api }) {
  const m = useData<{ merchants: Merchant[] }>(api, "/api/admin/merchants");
  const set = async (id: string, status: Merchant["status"]) => {
    await api("/api/admin/merchants", { method: "POST", body: JSON.stringify({ id, status }) });
    m.reload();
  };
  const label = { pending: "مستني", approved: "متوافق عليه", rejected: "مرفوض" };
  const tone = { pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400", approved: "bg-ok-soft text-ok", rejected: "bg-danger/10 text-danger" };
  return (
    <div className="space-y-3" data-testid="admin-merchants">
      {!m.data?.merchants.length && <p className="text-sm text-fg-muted">مفيش تجار مسجلين لسه.</p>}
      {m.data?.merchants.map((x) => (
        <Card key={x.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{x.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[x.status]}`}>{label[x.status]}</span>
            <span className="text-[12px] text-fg-muted">
              {x.country}
              {x.city ? ` · ${x.city}` : ""} · {x.kind}
            </span>
          </div>
          {x.description && <p className="mt-1 text-[13px] text-fg-soft">{x.description}</p>}
          <p className="mt-1 text-[12px] text-fg-muted" dir="auto">
            {x.items.slice(0, 4).map((i) => `${i.title} (${i.price} π)`).join(" · ")}
            {x.phone ? ` · ${x.phone}` : ""}
            {x.website ? ` · ${x.website}` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            {x.status !== "approved" && (
              <button onClick={() => set(x.id, "approved")} className="flex items-center gap-1 rounded-lg bg-ok px-3 py-1.5 text-[12px] font-semibold text-white" data-testid="approve">
                <Check className="size-3.5" /> موافقة
              </button>
            )}
            {x.status !== "rejected" && (
              <button onClick={() => set(x.id, "rejected")} className="flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-1.5 text-[12px] font-semibold text-danger" data-testid="reject">
                <X className="size-3.5" /> رفض
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------- searches ---------- */

function SearchesTab({ api }: { api: Api }) {
  const st = useData<Stats>(api, "/api/admin/stats?days=90");
  return (
    <div>
      <H>دوّروا عليه وملقوهوش (90 يوم)</H>
      <p className="mb-2 text-[12px] text-fg-muted">فرص للمتاجر الشريكة: حاجات الناس عايزاها ومفيش متجر باي بيبيعها لسه.</p>
      <div className="flex flex-wrap gap-2" data-testid="admin-misses">
        {st.data?.misses.map((m) => (
          <span key={m.q + m.country} className="rounded-full border border-line px-3 py-1 text-sm" dir="auto">
            {m.q} <span className="text-fg-muted">×{m.n} · {m.country}</span>
          </span>
        ))}
        {!st.data?.misses.length && <span className="text-sm text-fg-muted">—</span>}
      </div>
      <H>أكتر منتجات اتطلبت</H>
      <div className="space-y-1.5">
        {st.data?.topProducts.map((p) => (
          <div key={p.url} className="flex items-center gap-2 rounded-xl bg-bg-soft px-3 py-2 text-sm">
            <Logo name={p.store} size={22} />
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate" dir="auto">
              {p.title}
            </a>
            <span className="shrink-0 tabular-nums text-fg-muted">
              {p.orders} طلب · {p.visits} زيارة
            </span>
          </div>
        ))}
        {!st.data?.topProducts.length && <p className="text-sm text-fg-muted">—</p>}
      </div>
    </div>
  );
}

/* ---------- settings ---------- */

function SettingsTab({ api }: { api: Api }) {
  const set = useData<SiteSettings>(api, "/api/admin/settings");
  const [f, setF] = useState<SiteSettings | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (set.data) setF(set.data);
  }, [set.data]);
  if (!f) return <p className="text-sm text-fg-muted">{set.err || "…"}</p>;
  const cats = new Set(f.featured.cats.split(",").filter(Boolean));
  const save = async (patch: Partial<SiteSettings>) => {
    setMsg("");
    try {
      setF(await api<SiteSettings>("/api/admin/settings", { method: "PUT", body: JSON.stringify(patch) }));
      setMsg("✓ اتحفظ — هيظهر في الموقع خلال دقيقة");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="space-y-4" data-testid="admin-settings">
      {msg && <p className="rounded-xl bg-bg-soft px-3 py-2 text-[13px]">{msg}</p>}
      <Card>
        <H>أول صف في الصفحة الرئيسية</H>
        <label className="block text-[13px]">
          المتجر
          <select value={f.featured.store} onChange={(e) => setF({ ...f, featured: { ...f.featured, store: e.target.value } })} className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2" data-testid="featured-store">
            <option value="">كل المتاجر</option>
            <option value="salla">Salla Shop Mall</option>
            <option value="pcm">Pi Chain Mall</option>
            <option value="pkt">Piketplace</option>
            <option value="gtp">Global Trade Pi</option>
          </select>
        </label>
        <div className="mt-3 text-[13px]">التصنيفات</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {Object.entries(CAT_LABEL).map(([id, l]) => (
            <button
              key={id}
              onClick={() => {
                const next = new Set(cats);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setF({ ...f, featured: { ...f.featured, cats: [...next].join(",") } });
              }}
              className={`rounded-full border px-2.5 py-1 text-[12px] ${cats.has(id) ? "border-accent bg-accent text-white" : "border-line"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={f.featured.title_ar} onChange={(e) => setF({ ...f, featured: { ...f.featured, title_ar: e.target.value } })} placeholder="العنوان بالعربي" className="rounded-xl border border-line bg-bg px-3 py-2" />
          <input value={f.featured.title_en} onChange={(e) => setF({ ...f, featured: { ...f.featured, title_en: e.target.value } })} placeholder="Title in English" className="rounded-xl border border-line bg-bg px-3 py-2" dir="ltr" />
        </div>
        <button onClick={() => save({ featured: f.featured })} className="mt-3 rounded-xl bg-inv-bg px-4 py-2 text-[14px] font-semibold text-inv-fg" data-testid="save-featured">
          حفظ
        </button>
      </Card>

      <Card>
        <H>
          <span className="flex items-center gap-1.5">
            <Megaphone className="size-4" /> إعلان أعلى الصفحة الرئيسية
          </span>
        </H>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.announcement.on} onChange={(e) => setF({ ...f, announcement: { ...f.announcement, on: e.target.checked } })} data-testid="ann-on" /> يظهر للزوار
        </label>
        <textarea value={f.announcement.ar} onChange={(e) => setF({ ...f, announcement: { ...f.announcement, ar: e.target.value } })} placeholder="النص بالعربي" rows={2} className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2" data-testid="ann-ar" />
        <textarea value={f.announcement.en} onChange={(e) => setF({ ...f, announcement: { ...f.announcement, en: e.target.value } })} placeholder="Text in English" rows={2} className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2" dir="ltr" data-testid="ann-en" />
        <button onClick={() => save({ announcement: f.announcement })} className="mt-2 rounded-xl bg-inv-bg px-4 py-2 text-[14px] font-semibold text-inv-fg" data-testid="save-ann">
          حفظ
        </button>
      </Card>

      <Card>
        <H>تغيير باسورد اللوحة</H>
        <ChoosePassword api={api} onDone={() => setMsg("✓ الباسورد اتغير")} />
      </Card>
    </div>
  );
}
