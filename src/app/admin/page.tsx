"use client";

import { useCallback, useEffect, useState } from "react";
import { STORE_DIRECTORY } from "@/lib/stores";

/**
 * Owner dashboard (not linked from the app): traffic Dalil Pi sends to each store, searches that
 * found nothing, and the state of Dalil Index. The key (ADMIN_SECRET, or CRON_SECRET) stays in
 * this browser only.
 */

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

const LOGO: Record<string, string | undefined> = Object.fromEntries(STORE_DIRECTORY.map((d) => [d.name, d.logo]));
const KEY = "dalil-admin-key";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    try {
      setKey(localStorage.getItem(KEY) ?? "");
    } catch {}
  }, []);

  const load = useCallback(async (k: string, d: number) => {
    if (!k) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/stats?days=${d}`, { headers: { Authorization: `Bearer ${k}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
      try {
        localStorage.setItem(KEY, k);
      } catch {}
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (key && !data && !busy && !err) void load(key, days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const report = (s: Stats["stores"][number]) =>
    `Dalil Pi → ${s.store}: in the last ${data?.days} days Dalil Pi sent you ${s.visits} visitors and ${s.orders} orders (${s.last7} in the last 7 days). Every result links straight to your product page.\n` +
    `دليل باي ← ${s.store}: في آخر ${data?.days} يوم دليل باي بعتلكم ${s.visits} زيارة و${s.orders} طلب (${s.last7} في آخر 7 أيام).`;

  const max = Math.max(1, ...(data?.daily ?? []).map((d) => d.visits + d.orders));

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 py-6" data-testid="admin">
      <h1 className="text-2xl font-bold">لوحة دليل باي</h1>
      <p className="mt-1 text-sm text-fg-muted">الزيارات والطلبات اللي دليل باي بعتها للمتاجر، والحاجات اللي الناس دوّرت عليها وملقتهاش.</p>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(key, days);
        }}
      >
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ADMIN_SECRET / CRON_SECRET" className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm" dir="ltr" data-testid="admin-key" />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl border border-line bg-bg px-3 py-2 text-sm">
          {[7, 30, 90, 180].map((d) => (
            <option key={d} value={d}>
              آخر {d} يوم
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-inv-bg px-4 py-2 text-sm font-semibold text-inv-fg" disabled={busy} data-testid="admin-load">
          {busy ? "…" : "عرض"}
        </button>
      </form>
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}

      {data && (
        <div className="mt-6 space-y-8">
          <section className="grid grid-cols-3 gap-3" data-testid="admin-totals">
            {[
              ["زيارات للمتاجر", data.totals.visits],
              ["طلبات", data.totals.orders],
              ["بحث بدون نتيجة", data.totals.misses],
            ].map(([l, n]) => (
              <div key={l as string} className="rounded-2xl border border-line p-4">
                <div className="text-[12px] text-fg-muted">{l}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{(n as number).toLocaleString("en-US")}</div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">كل يوم</h2>
            <div className="flex h-36 gap-[3px] rounded-2xl border border-line p-3" dir="ltr" aria-label="daily traffic" data-testid="admin-chart">
              {data.daily.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.visits} visits, ${d.orders} orders`}>
                  <div className="rounded-t-sm bg-accent" style={{ height: `${(d.orders / max) * 100}%` }} />
                  <div className="bg-fg/25" style={{ height: `${(d.visits / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-fg-muted">رمادي = زيارات · بنفسجي = طلبات</p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">لكل متجر</h2>
            <div className="overflow-hidden rounded-2xl border border-line" data-testid="admin-stores">
              {!data.stores.length && <p className="p-4 text-sm text-fg-muted">لسه مفيش زيارات.</p>}
              {data.stores.map((s) => (
                <div key={s.store} className="flex items-center gap-3 border-b border-line p-3 last:border-0">
                  {LOGO[s.store] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={LOGO[s.store]} alt="" className="size-9 rounded-xl bg-white object-contain ring-1 ring-line" />
                  ) : (
                    <span className="size-9 rounded-xl bg-bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.store}</div>
                    <div className="text-[12px] text-fg-muted">
                      {s.visits} زيارة · {s.orders} طلب · {s.last7} آخر 7 أيام
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await navigator.clipboard?.writeText(report(s)).catch(() => {});
                      setCopied(s.store);
                      setTimeout(() => setCopied(""), 1500);
                    }}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[12px]"
                  >
                    {copied === s.store ? "اتنسخ ✓" : "انسخ تقرير للمتجر"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">أكتر منتجات اتطلبت</h2>
            <ol className="space-y-1.5 text-sm">
              {data.topProducts.map((p) => (
                <li key={p.url} className="flex justify-between gap-3 rounded-xl bg-bg-soft px-3 py-2">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate" dir="auto">
                    {p.title} <span className="text-fg-muted">· {p.store}</span>
                  </a>
                  <span className="shrink-0 tabular-nums text-fg-muted">
                    {p.orders} طلب · {p.visits} زيارة
                  </span>
                </li>
              ))}
              {!data.topProducts.length && <li className="text-fg-muted">—</li>}
            </ol>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">دوّروا عليه وملقوهوش</h2>
            <p className="mb-2 text-[12px] text-fg-muted">فرص للمتاجر الشريكة: حاجات الناس عايزاها ومفيش متجر باي بيبيعها لسه.</p>
            <div className="flex flex-wrap gap-2" data-testid="admin-misses">
              {data.misses.map((m) => (
                <span key={m.q + m.country} className="rounded-full border border-line px-3 py-1 text-sm" dir="auto">
                  {m.q} <span className="text-fg-muted">×{m.n} · {m.country}</span>
                </span>
              ))}
              {!data.misses.length && <span className="text-sm text-fg-muted">—</span>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">فهرس دليل</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {data.catalog.map((c) => (
                <div key={c.source} className="rounded-2xl border border-line p-3 text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-[12px] text-fg-muted">
                    {c.total} منتج · {c.ok === false ? "⚠️ آخر تحديث فشل" : c.ageMin == null ? "لسه" : `من ${c.ageMin} دقيقة`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
