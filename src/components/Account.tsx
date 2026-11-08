"use client";

import { AnimatePresence, m } from "framer-motion";
import { Check, ExternalLink, Loader2, MapPin, Package, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { countryLabel, flag, formatMoney, type Strings } from "@/lib/i18n";
import { inPiBrowser, openExternal, piPay } from "@/lib/pi-client";
import { AnimatedCheck } from "./cards";
import type { Address, Lang, Me, Merchant, Offer, Order, PaidPlanId, PlanOffer, Settings, ShopQuestion, Usage, Watch } from "@/lib/types";

type Tab = "plan" | "addresses" | "orders" | "watch" | "prefs" | "shop" | "messages";
const TABS: Tab[] = ["plan", "watch", "orders", "messages", "addresses", "prefs", "shop"];

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
  return j as T;
}

export function useAddresses(api: Fetch, enabled: boolean) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setAddresses((await json<{ addresses: Address[] }>(await api("/api/addresses"))).addresses);
    } catch {
      setAddresses([]);
    }
  }, [api, enabled]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { addresses, reload };
}

export function formatAddress(a: Pick<Address, "fullName" | "phone" | "street" | "building" | "area" | "city" | "postalCode" | "country" | "notes">, lang: Lang): string {
  return [
    a.fullName,
    a.phone,
    [a.street, a.building].filter(Boolean).join(", "),
    [a.area, a.city, a.postalCode].filter(Boolean).join(", "),
    countryLabel(a.country, lang),
    a.notes ? `(${a.notes})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---------------- Address form ---------------- */

const EMPTY = { label: "", fullName: "", phone: "", country: "", city: "", area: "", street: "", building: "", postalCode: "", notes: "", isDefault: false };

export function AddressForm({
  s,
  api,
  initial,
  country,
  onSaved,
  onCancel,
}: {
  s: Strings;
  api: Fetch;
  initial?: Address;
  country: string;
  onSaved: (a: Address) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState(() =>
    initial
      ? {
          label: initial.label ?? "",
          fullName: initial.fullName,
          phone: initial.phone,
          country: initial.country,
          city: initial.city,
          area: initial.area ?? "",
          street: initial.street,
          building: initial.building ?? "",
          postalCode: initial.postalCode ?? "",
          notes: initial.notes ?? "",
          isDefault: initial.isDefault,
        }
      : { ...EMPTY, country },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: k === "isDefault" ? e.target.checked : e.target.value }));
  const field = (k: keyof typeof EMPTY, label: string, opts: { required?: boolean; type?: string; dir?: "ltr" | "auto" } = {}) => (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-fg-muted">
        {label}
        {opts.required ? " *" : ""}
      </span>
      <input
        name={k}
        type={opts.type ?? "text"}
        dir={opts.dir ?? "auto"}
        value={f[k] as string}
        onChange={set(k)}
        required={opts.required}
        className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
      />
    </label>
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = JSON.stringify({ ...f, country: f.country.toUpperCase() });
      const res = initial
        ? await api(`/api/addresses/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await api("/api/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      onSaved((await json<{ address: Address }>(res)).address);
    } catch (er) {
      setErr((er as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2.5" data-testid="address-form">
      {field("fullName", s.fullName, { required: true })}
      {field("phone", s.phone, { required: true, type: "tel", dir: "ltr" })}
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-fg-muted">ISO *</span>
          <input
            name="country"
            value={f.country}
            maxLength={2}
            onChange={(e) => setF((x) => ({ ...x, country: e.target.value.toUpperCase() }))}
            required
            dir="ltr"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm uppercase outline-none focus:border-fg"
          />
        </label>
        {field("city", s.city, { required: true })}
      </div>
      {field("area", s.area)}
      {field("street", s.street, { required: true })}
      {field("building", s.building)}
      <div className="grid grid-cols-2 gap-2">
        {field("postalCode", s.postalCode, { dir: "ltr" })}
        {field("label", s.label)}
      </div>
      {field("notes", s.notes)}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isDefault} onChange={set("isDefault")} className="size-4" />
        {s.makeDefault}
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />} {s.save}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-line px-4 text-sm hover:bg-bg-soft">
          {s.cancel}
        </button>
      </div>
    </form>
  );
}

function AddressCard({ a, s, lang, onEdit, onDelete, selected, onSelect }: { a: Address; s: Strings; lang: Lang; onEdit?: () => void; onDelete?: () => void; selected?: boolean; onSelect?: () => void }) {
  return (
    <div
      onClick={onSelect}
      role={onSelect ? "radio" : undefined}
      aria-checked={onSelect ? selected : undefined}
      className={`rounded-2xl border p-3 text-sm ${onSelect ? "cursor-pointer" : ""} ${selected ? "border-fg" : "border-line"}`}
    >
      <div className="flex items-center gap-2">
        <MapPin className="size-3.5 shrink-0 text-fg-muted" />
        <span className="font-semibold">{a.label || a.fullName}</span>
        {a.isDefault && <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold">{s.defaultTag}</span>}
        <span className="ms-auto flex items-center gap-1">
          {selected && <Check className="size-4" />}
          {onEdit && (
            <button type="button" onClick={(e) => (e.stopPropagation(), onEdit())} className="rounded-md p-1 text-fg-muted hover:text-fg" aria-label={s.editAddress}>
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={(e) => (e.stopPropagation(), onDelete())} className="rounded-md p-1 text-fg-muted hover:text-fg" aria-label={s.delete}>
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-fg-soft" dir="auto">
        {flag(a.country)} {formatAddress(a, lang)}
      </p>
    </div>
  );
}

/* ---------------- Sheet shell ---------------- */

function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <m.div
            role="dialog"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-bg shadow-card sm:bottom-auto sm:top-[6dvh] sm:rounded-3xl"
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <span className="text-sm font-semibold">{title}</span>
              <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Account sheet: plan, addresses, orders ---------------- */

export function AccountSheet({
  open,
  onClose,
  s,
  lang,
  me,
  api,
  country,
  onUsage,
  initialTab,
  settings,
  onSettings,
  onWatchesSeen,
}: {
  open: boolean;
  onClose: () => void;
  s: Strings;
  lang: Lang;
  me: Me | null;
  api: Fetch;
  country: string;
  onUsage: (u: Usage) => void;
  initialTab?: Tab;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onWatchesSeen?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("plan");
  useEffect(() => {
    if (open) setTab(initialTab ?? "plan");
  }, [open, initialTab]);
  const { addresses, reload } = useAddresses(api, open && !!me);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [fb, setFb] = useState<{ reviewed: string[]; reported: string[] }>({ reviewed: [], reported: [] });
  const loadFeedback = useCallback(async () => {
    try {
      setFb(await json<{ reviewed: string[]; reported: string[] }>(await api("/api/feedback")));
    } catch {
      /* ignore */
    }
  }, [api]);
  const loadOrders = useCallback(async () => {
    void loadFeedback();
    try {
      setOrders((await json<{ orders: Order[] }>(await api("/api/orders"))).orders);
    } catch {
      setOrders([]);
    }
  }, [api]);
  useEffect(() => {
    if (open && me && tab === "orders") void loadOrders();
  }, [open, me, tab, loadOrders]);

  const setStatus = async (o: Order, status: string) => {
    await api(`/api/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await loadOrders();
  };
  const remove = async (a: Address) => {
    await api(`/api/addresses/${a.id}`, { method: "DELETE" });
    await reload();
  };
  const u = me?.usage;
  const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "long" }) : "");

  return (
    <Sheet open={open} title={s.account} onClose={onClose}>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setEditing(null);
            }}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium ${tab === k ? "border-fg bg-inv-bg text-inv-fg" : "border-line text-fg-soft"}`}
          >
            {k === "plan" ? s.plan : k === "addresses" ? s.addresses : k === "orders" ? s.orders : k === "watch" ? s.watchlist : k === "shop" ? s.myShop : k === "messages" ? s.messages : s.prefs}
          </button>
        ))}
      </div>

      {tab === "plan" && u && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-line p-4" data-testid="current-plan">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.plan}</div>
            <div className="mt-1 text-xl font-semibold">{s.plans[u.plan] ?? u.plan}</div>
            <div className="mt-0.5 text-xs text-fg-muted">{u.planEndsAt ? s.planValidUntil(date(u.planEndsAt)) : s.freeRenews(date(u.renewsAt))}</div>
            {!!u.packs?.length && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {u.packs.map((p) => (
                  <li key={p.id} className="text-[12px]" data-testid="pack">
                    <span className="font-medium">{s.plans[p.plan] ?? p.plan}</span>
                    <span className="text-fg-muted"> — {s.packLine(p.searchesLeft, p.ordersLeft, date(p.endsAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {[
            { label: s.searchesUsed, used: u.searchesUsed, limit: u.searchLimit },
            { label: s.ordersUsed, used: u.ordersUsed, limit: u.orderLimit },
          ].map((x) => (
            <div key={x.label}>
              <div className="flex justify-between text-xs">
                <span>{x.label}</span>
                <span className="tabular-nums text-fg-muted" dir="ltr">
                  {x.used} / {x.limit}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                <div className="h-full rounded-full bg-fg" style={{ width: `${Math.min(100, x.limit ? (x.used / x.limit) * 100 : 100)}%` }} />
              </div>
            </div>
          ))}
          <PlanShop s={s} api={api} open={open} onUsage={onUsage} lang={lang} usageKey={u.packs?.map((p) => p.id).join(",") ?? ""} />
          <p className="text-[11px] text-fg-muted">@{me?.username ?? me?.uid}</p>
        </div>
      )}

      {tab === "addresses" &&
        (editing ? (
          <AddressForm
            s={s}
            api={api}
            initial={editing === "new" ? undefined : editing}
            country={country}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await reload();
            }}
          />
        ) : (
          <div className="space-y-2">
            {addresses === null ? (
              <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />
            ) : addresses.length === 0 ? (
              <p className="py-4 text-center text-sm text-fg-muted">{s.noAddresses}</p>
            ) : (
              addresses.map((a) => <AddressCard key={a.id} a={a} s={s} lang={lang} onEdit={() => setEditing(a)} onDelete={() => remove(a)} />)
            )}
            <button onClick={() => setEditing("new")} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2.5 text-sm font-medium hover:bg-bg-soft">
              <Plus className="size-4" /> {s.addAddress}
            </button>
          </div>
        ))}

      {tab === "watch" && <WatchList s={s} lang={lang} api={api} onSeen={onWatchesSeen} />}
      {tab === "prefs" && (
        <>
          <Telegram s={s} api={api} />
          <Prefs s={s} settings={settings} onSettings={onSettings} />
        </>
      )}
      {tab === "messages" && <Messages s={s} api={api} lang={lang} />}
      {tab === "shop" && <MyShop s={s} api={api} country={country} />}

      {tab === "orders" && (
        <div className="space-y-2">
          {orders === null ? (
            <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />
          ) : orders.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">{s.noOrders}</p>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="rounded-2xl border border-line p-3 text-sm" data-testid="order-row">
                <div className="flex items-start gap-2">
                  <Package className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" dir="auto">
                      {o.productTitle}
                    </div>
                    <div className="text-xs text-fg-muted">
                      {o.storeName} · <span dir="ltr">{formatMoney(o.total, o.currency, lang)}</span> · {date(o.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold">{s.status[o.status] ?? o.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.checkoutUrl && (o.status === "draft" || o.status === "placed") && (
                    <a href={o.checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-inv-bg px-2.5 py-1 text-[11px] font-semibold text-inv-fg">
                      {s.openStore} <ExternalLink className="size-3" />
                    </a>
                  )}
                  {(o.status === "draft" || o.status === "placed") && (
                    <button onClick={() => setStatus(o, "paid")} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium hover:bg-bg-soft">
                      {s.markPaid}
                    </button>
                  )}
                  {(o.status === "paid" || o.status === "shipped") && (
                    <button onClick={() => setStatus(o, "delivered")} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium hover:bg-bg-soft">
                      {s.markDelivered}
                    </button>
                  )}
                  {(o.status === "draft" || o.status === "placed") && (
                    <button onClick={() => setStatus(o, "cancelled")} className="rounded-lg px-2.5 py-1 text-[11px] text-fg-muted hover:text-fg">
                      {s.cancelOrder}
                    </button>
                  )}
                </div>
                <OrderFeedback o={o} s={s} api={api} fb={fb} onDone={loadFeedback} />
              </div>
            ))
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Plan shop: pay with Pi, 30-day packs ---------------- */

function PlanShop({ s, api, open, onUsage, lang, usageKey }: { s: Strings; api: Fetch; open: boolean; onUsage: (u: Usage) => void; lang: Lang; usageKey: string }) {
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "long" });
  const [plans, setPlans] = useState<(PlanOffer & { quote: string | null })[] | null>(null);
  const [paying, setPaying] = useState<PaidPlanId | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setPlans((await json<{ plans: (PlanOffer & { quote: string | null })[] }>(await api("/api/plans"))).plans);
    } catch {
      setPlans([]);
    }
  }, [api]);
  useEffect(() => {
    if (open) void load();
  }, [open, load, usageKey]);

  const buy = async (p: PlanOffer & { quote: string | null }) => {
    if (!p.amountPi || !p.quote || p.activeUntil || paying) return;
    setPaying(p.id);
    setMsg(null);
    try {
      const post = (url: string, body: unknown) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const r = await piPay<{ usage: Usage }>({
        amount: p.amountPi,
        memo: `Dalil Pi — ${s.plans[p.id] ?? p.id} (30 days)`,
        metadata: { plan: p.id, quote: p.quote },
        post,
      });
      onUsage(r.usage);
      setMsg({ ok: true, text: s.paid(s.plans[p.id] ?? p.id) });
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e as Error).message;
      setMsg({
        ok: false,
        text: code === "PAYMENT_CANCELLED" ? s.payCancelled : code === "PI_SDK_UNAVAILABLE" ? s.payInPiBrowser : `${s.payFailed} ${(e as Error).message}`,
      });
    } finally {
      setPaying(null);
      void load(); // fresh quotes
    }
  };

  return (
    <div className="space-y-2 pt-1" data-testid="plan-shop">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">
        <Sparkles className="size-3.5" /> {s.shop}
      </div>
      {plans === null ? (
        <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />
      ) : (
        plans.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${p.activeUntil ? "border-fg/40 bg-bg-soft" : "border-line"}`}
            data-testid="plan-offer"
            data-plan={p.id}
            data-active={p.activeUntil ? "1" : undefined}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold">{s.plans[p.id] ?? p.id}</span>
                <span className="text-[11px] text-fg-muted">· {s.perDays(p.days)}</span>
              </div>
              <div className="text-[12px] text-fg-soft">{s.planIncludes(p.searches, p.orders)}</div>
              {p.activeUntil && <div className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">✓ {s.subscribedUntil(day(p.activeUntil))}</div>}
            </div>
            <div className="text-end">
              <div className="text-sm font-semibold tabular-nums" dir="ltr">
                {p.amountPi != null ? `${p.amountPi} π` : "—"}
              </div>
              <div className="text-[10px] text-fg-muted tabular-nums" dir="ltr">
                ${p.priceUsd.toFixed(2)}
              </div>
            </div>
            <button
              onClick={() => buy(p)}
              disabled={!p.amountPi || !p.quote || !!p.activeUntil || !!paying}
              aria-disabled={!!p.activeUntil}
              title={p.activeUntil ? s.subscribedUntil(day(p.activeUntil)) : !p.amountPi ? s.priceUnavailable : undefined}
              className="flex min-w-16 items-center justify-center gap-1 rounded-full bg-inv-bg px-3 py-1.5 text-[12px] font-semibold text-inv-fg disabled:opacity-40"
            >
              {paying === p.id ? <Loader2 className="size-3.5 animate-spin" /> : p.activeUntil ? s.subscribed : s.buy}
            </button>
          </div>
        ))
      )}
      {msg && (
        <p className={`flex items-center gap-1.5 text-[12px] ${msg.ok ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-danger"}`} role="status" data-testid="pay-msg">
          {msg.ok && <AnimatedCheck size={18} />}
          {msg.text}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-fg-muted">
        {s.expiryNote} {s.payNote}
      </p>
    </div>
  );
}

/* ---------------- Automatic order at a store with a Pi checkout ---------------- */

export function AutoOrderSheet({
  offer,
  onClose,
  s,
  lang,
  me,
  api,
  country,
  onDone,
}: {
  offer: Offer | null;
  onClose: () => void;
  s: Strings;
  lang: Lang;
  me: Me | null;
  api: Fetch;
  country: string;
  onDone: (r: { order?: Order; usage?: Usage; email: string }) => void;
}) {
  const open = !!offer;
  const { addresses, reload } = useAddresses(api, open && !!me);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setEmail(me?.email ?? "");
      setErr("");
    }
  }, [open, me?.email]);
  const addr = addresses?.find((a) => a.isDefault) ?? addresses?.[0];

  const place = async () => {
    if (!offer || !addr || busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr(s.emailInvalid);
    // Open the tab inside the click so the browser doesn't block it; fill it once the store answers.
    // (Not in the Pi Browser: it can't fill a blank tab later, so the checkout opens in place there.)
    const w = inPiBrowser() ? null : window.open("about:blank", "_blank");
    if (w) w.opener = null;
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, addressId: addr.id, auto: true, email }) });
      const j = (await res.json().catch(() => ({}))) as { order?: Order; usage?: Usage; error?: string };
      if (!res.ok || !j.order?.checkoutUrl) throw new Error(j.error || `HTTP ${res.status}`);
      if (w) w.location.href = j.order.checkoutUrl;
      else window.location.href = j.order.checkoutUrl;
      onDone({ order: j.order, usage: j.usage, email });
      onClose();
    } catch (e) {
      w?.close();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title={s.autoTitle} onClose={onClose}>
      {offer && (
        <div className="space-y-3" data-testid="auto-order">
          <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" dir="auto">
                {offer.title}
              </div>
              <div className="text-[12px] text-fg-muted">{offer.store}</div>
            </div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">
              {formatMoney(offer.total, offer.currency, lang)}
            </div>
          </div>
          {addresses === null ? (
            <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />
          ) : addr ? (
            <div className="rounded-2xl bg-bg-soft p-3 text-[12px] whitespace-pre-line" dir="auto" data-testid="ship-to">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.shipTo}</div>
              {formatAddress(addr, lang)}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[12px] text-fg-soft">{s.needAddress}</p>
              <AddressForm s={s} api={api} country={country} onCancel={onClose} onSaved={() => void reload()} />
            </div>
          )}
          {addr && (
            <>
              <label className="block text-[12px]">
                <span className="text-fg-muted">{s.email}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  autoComplete="email"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
                />
              </label>
              <p className="text-[11px] leading-relaxed text-fg-muted">{s.autoShare(offer.store)}</p>
              {err && (
                <p className="text-[12px] text-danger" role="alert" data-testid="auto-error">
                  {err}
                </p>
              )}
              <button
                onClick={place}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {s.placing}
                  </>
                ) : (
                  s.placeOrder
                )}
              </button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Watchlist (price-drop alerts) ---------------- */

function WatchList({ s, lang, api, onSeen }: { s: Strings; lang: Lang; api: Fetch; onSeen?: () => void }) {
  const [items, setItems] = useState<Watch[] | null>(null);
  const load = useCallback(async () => {
    try {
      setItems((await json<{ watches: Watch[] }>(await api("/api/watches?seen=1"))).watches);
      onSeen?.();
    } catch {
      setItems([]);
    }
  }, [api, onSeen]);
  useEffect(() => {
    void load();
  }, [load]);
  const remove = async (w: Watch) => {
    await api(`/api/watches/${w.id}`, { method: "DELETE" });
    setItems((x) => x?.filter((y) => y.id !== w.id) ?? null);
  };
  if (items === null) return <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />;
  return (
    <div className="space-y-2" data-testid="watchlist">
      {items.length === 0 && <p className="py-4 text-center text-sm text-fg-muted">{s.noWatches}</p>}
      {items.map((w) => {
        const down = w.lastPrice < w.price;
        return (
          <div key={w.id} className="flex items-center gap-3 rounded-2xl border border-line p-3" data-testid="watch-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {w.image ? <img src={w.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-xl object-cover" /> : <span className="size-12 shrink-0 rounded-xl bg-bg-muted" />}
            <div className="min-w-0 flex-1">
              <a href={w.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[13px] font-medium" dir="auto">
                {w.title}
              </a>
              <div className="text-[11px] text-fg-muted">
                {w.store} · <span dir="ltr">{formatMoney(w.lastPrice, w.currency, lang)}</span>
                {down && (
                  <span className="ms-1 line-through" dir="ltr">
                    {formatMoney(w.price, w.currency, lang)}
                  </span>
                )}
              </div>
              {(down || w.newDrop) && !w.targetHit && <span className="mt-0.5 inline-block rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">{s.dropBadge}</span>}
              {w.targetHit && <span className="mt-0.5 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white" data-testid="target-hit">🎯 {s.targetHit}</span>}
              {w.targetPrice != null && !w.targetHit && (
                <span className="ms-1 mt-0.5 inline-block rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold" dir="ltr">
                  🎯 {s.targetBadge(formatMoney(w.targetPrice, w.currency, lang))}
                </span>
              )}
            </div>
            <button onClick={() => remove(w)} aria-label={s.delete} className="rounded-full p-1.5 text-fg-muted hover:bg-bg-soft">
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-fg-muted">{s.watchNote}</p>
    </div>
  );
}

/* ---------------- Shopping preferences (saved on this device) ---------------- */

function Prefs({ s, settings, onSettings }: { s: Strings; settings: Settings; onSettings: (patch: Partial<Settings>) => void }) {
  const p = settings.prefs ?? {};
  const [budget, setBudget] = useState(p.budgetPi ? String(p.budgetPi) : "");
  const [brands, setBrands] = useState(p.brands ?? "");
  const [shipOnly, setShipOnly] = useState(!!p.shipOnly);
  const [saved, setSaved] = useState(false);
  const save = () => {
    const b = Number(budget);
    onSettings({ prefs: { budgetPi: b > 0 ? b : null, brands: brands.trim().slice(0, 120) || null, shipOnly } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const field = "mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg";
  return (
    <div className="space-y-3" data-testid="prefs">
      <p className="text-[12px] text-fg-muted">{s.prefsNote}</p>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.budget}</span>
        <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} dir="ltr" className={field} placeholder="500" />
      </label>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.brands}</span>
        <input value={brands} onChange={(e) => setBrands(e.target.value)} maxLength={120} className={field} placeholder="Samsung, Anker" />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={shipOnly} onChange={(e) => setShipOnly(e.target.checked)} className="size-4" />
        {s.shipOnly}
      </label>
      <button onClick={save} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg">
        {saved ? (
          <>
            <AnimatedCheck size={16} /> {s.saved}
          </>
        ) : (
          s.save
        )}
      </button>
    </div>
  );
}

/* ---------------- My shop ("Dalil Pi for merchants") ---------------- */

function MyShop({ s, api, country }: { s: Strings; api: Fetch; country: string }) {
  const [m, setM] = useState<Merchant | null | undefined>(undefined);
  const [f, setF] = useState({ name: "", kind: "local" as Merchant["kind"], city: "", address: "", phone: "", website: "", categories: "", description: "", piWallet: "" });
  const [items, setItems] = useState<{ title: string; price: string }[]>([{ title: "", price: "" }]);
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const r = await json<{ merchant: Merchant | null }>(await api("/api/merchants/me"));
        setM(r.merchant);
        if (r.merchant) {
          const x = r.merchant;
          setF({ name: x.name, kind: x.kind, city: x.city ?? "", address: x.address ?? "", phone: x.phone ?? "", website: x.website ?? "", categories: x.categories ?? "", description: x.description ?? "", piWallet: x.piWallet ?? "" });
          setItems(x.items.length ? x.items.map((i) => ({ title: i.title, price: String(i.price) })) : [{ title: "", price: "" }]);
          if (x.lat != null && x.lon != null) setLoc({ lat: x.lat, lon: x.lon });
        }
      } catch {
        setM(null);
      }
    })();
  }, [api]);
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const body = {
        ...f,
        country,
        lat: loc?.lat ?? null,
        lon: loc?.lon ?? null,
        items: items.filter((i) => i.title.trim() && Number(i.price) > 0).map((i) => ({ title: i.title.trim(), price: Number(i.price) })),
      };
      const r = await json<{ merchant: Merchant }>(await api("/api/merchants/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setM(r.merchant);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = "mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg";
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  if (m === undefined) return <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />;
  return (
    <div className="space-y-2.5" data-testid="my-shop">
      <p className="text-[12px] leading-relaxed text-fg-muted">{s.shopIntro}</p>
      {m && (
        <div className={`rounded-xl px-3 py-2 text-[12px] font-medium ${m.status === "approved" ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : m.status === "rejected" ? "bg-danger/10 text-danger" : "bg-bg-soft"}`} data-testid="shop-status">
          {s.shopStatus[m.status]}
        </div>
      )}
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.shopName}</span>
        <input value={f.name} onChange={set("name")} className={field} />
      </label>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.shopKind}</span>
        <select value={f.kind} onChange={set("kind")} className={field}>
          {(["local", "online", "service"] as const).map((k) => (
            <option key={k} value={k}>
              {s.shopKinds[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px]">
          <span className="text-fg-muted">{s.city}</span>
          <input value={f.city} onChange={set("city")} className={field} />
        </label>
        <label className="block text-[12px]">
          <span className="text-fg-muted">{s.phone}</span>
          <input value={f.phone} onChange={set("phone")} dir="ltr" className={field} />
        </label>
      </div>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.street}</span>
        <input value={f.address} onChange={set("address")} className={field} />
      </label>
      <button
        type="button"
        onClick={() => navigator.geolocation?.getCurrentPosition((p) => setLoc({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lon: Math.round(p.coords.longitude * 1e5) / 1e5 }))}
        className="flex items-center gap-1.5 text-[12px] underline underline-offset-2"
      >
        <MapPin className="size-3.5" /> {loc ? s.shopLocated : s.shopUseLocation}
      </button>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.shopWebsite}</span>
        <input value={f.website} onChange={set("website")} dir="ltr" placeholder="https://" className={field} />
      </label>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.shopCategories}</span>
        <input value={f.categories} onChange={set("categories")} className={field} />
      </label>
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.shopAbout}</span>
        <textarea value={f.description} onChange={set("description")} rows={2} maxLength={400} className={field} />
      </label>
      <div className="text-[12px] text-fg-muted">{s.shopItems}</div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <input value={it.title} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} placeholder={s.shopItemName} className={field + " mt-0 flex-1"} data-testid="item-title" />
          <input value={it.price} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, price: e.target.value.replace(/[^\d.]/g, "") } : y)))} placeholder="π" inputMode="decimal" dir="ltr" className={field + " mt-0 w-20"} data-testid="item-price" />
        </div>
      ))}
      {items.length < 20 && (
        <button type="button" onClick={() => setItems((x) => [...x, { title: "", price: "" }])} className="flex items-center gap-1 text-[12px] font-medium">
          <Plus className="size-3.5" /> {s.shopAddItem}
        </button>
      )}
      <label className="block text-[12px]">
        <span className="text-fg-muted">{s.shopWallet}</span>
        <input value={f.piWallet} onChange={(e) => setF((x) => ({ ...x, piWallet: e.target.value.toUpperCase() }))} dir="ltr" className={field} />
      </label>
      {err && <p className="text-[12px] text-danger">{err}</p>}
      <button onClick={save} disabled={busy || f.name.trim().length < 2} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" /> : m ? s.shopUpdate : s.shopSubmit}
      </button>
    </div>
  );
}

/* ---------------- Order feedback: review the store / report a problem ---------------- */

function OrderFeedback({ o, s, api, fb, onDone }: { o: Order; s: Strings; api: Fetch; fb: { reviewed: string[]; reported: string[] }; onDone: () => void }) {
  const [mode, setMode] = useState<"" | "review" | "report">("");
  const [rating, setRating] = useState(5);
  const [kind, setKind] = useState("not_delivered");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const canReview = ["paid", "shipped", "delivered"].includes(o.status) && !fb.reviewed.includes(o.id);
  const canReport = o.status !== "draft" && o.status !== "cancelled" && !fb.reported.includes(o.id);
  if (msg) return <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400"><AnimatedCheck size={14} /> {msg}</p>;
  if (!canReview && !canReport) return null;
  const send = async () => {
    const r =
      mode === "review"
        ? await api("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: o.id, rating, comment: text || null }) })
        : await api("/api/disputes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: o.id, kind, details: text || null }) });
    if (r.ok) {
      setMsg(mode === "review" ? s.reviewThanks : s.reportThanks);
      onDone();
    } else setMsg(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  };
  return (
    <div className="mt-2 space-y-2" data-testid="order-feedback">
      <div className="flex gap-1.5">
        {canReview && (
          <button onClick={() => setMode(mode === "review" ? "" : "review")} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium" data-testid="rate-store">
            ⭐ {s.rateStore}
          </button>
        )}
        {canReport && (
          <button onClick={() => setMode(mode === "report" ? "" : "report")} className="rounded-lg border border-danger/40 px-2.5 py-1 text-[11px] font-medium text-danger" data-testid="report-problem">
            ⚠️ {s.reportProblem}
          </button>
        )}
      </div>
      {mode && (
        <div className="space-y-2 rounded-xl bg-bg-soft p-2.5">
          {mode === "review" ? (
            <div className="flex gap-1" role="radiogroup" aria-label={s.rateStore}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className={`text-xl ${n <= rating ? "" : "opacity-25"}`} aria-label={`${n}`}>
                  ★
                </button>
              ))}
            </div>
          ) : (
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" data-testid="problem-kind">
              {Object.entries(s.problemKinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} placeholder={s.commentOptional} className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-sm outline-none" dir="auto" />
          <button onClick={send} className="w-full rounded-lg bg-inv-bg py-1.5 text-[12px] font-semibold text-inv-fg" data-testid="feedback-send">
            {s.send}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Messages: my questions + my shop's inbox ---------------- */

function Messages({ s, api, lang }: { s: Strings; api: Fetch; lang: Lang }) {
  const [mine, setMine] = useState<ShopQuestion[] | null>(null);
  const [inbox, setInbox] = useState<ShopQuestion[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      json<{ questions: ShopQuestion[] }>(await api("/api/questions")).catch(() => ({ questions: [] })),
      json<{ questions: ShopQuestion[] }>(await api("/api/merchants/inbox")).catch(() => ({ questions: [] })),
    ]);
    setMine(a.questions);
    setInbox(b.questions);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const answer = async (id: string) => {
    await api("/api/merchants/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, answer: draft[id] }) });
    await load();
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "short" });
  if (mine === null) return <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />;
  return (
    <div className="space-y-3" data-testid="messages">
      {inbox.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.shopInbox}</div>
          {inbox.map((q) => (
            <div key={q.id} className="rounded-2xl border border-line p-3 text-[13px]" data-testid="inbox-row">
              <div dir="auto">❓ {q.question}</div>
              {q.answer ? (
                <div className="mt-1 text-fg-soft" dir="auto">
                  ↳ {q.answer}
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input value={draft[q.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))} className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1 text-sm" dir="auto" data-testid="answer-input" />
                  <button onClick={() => answer(q.id)} disabled={!draft[q.id]?.trim()} className="rounded-lg bg-inv-bg px-3 text-[12px] font-semibold text-inv-fg disabled:opacity-50">
                    {s.answer}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!mine.length && !inbox.length && <p className="py-4 text-center text-sm text-fg-muted">{s.noMessages}</p>}
      {mine.map((q) => (
        <div key={q.id} className="rounded-2xl border border-line p-3 text-[13px]" data-testid="question-row">
          <div className="text-[11px] text-fg-muted">
            {q.shop} · {day(q.createdAt)}
          </div>
          <div dir="auto">❓ {q.question}</div>
          <div className={`mt-1 ${q.answer ? "text-fg" : "text-fg-muted"}`} dir="auto">
            {q.answer ? `💬 ${q.answer}` : `⏳ ${s.waiting}`}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Telegram notifications ---------------- */

function Telegram({ s, api }: { s: Strings; api: Fetch }) {
  const [st, setSt] = useState<{ configured: boolean; linked: boolean } | null>(null);
  const [opened, setOpened] = useState(false);
  const load = useCallback(async () => {
    try {
      setSt(await json<{ configured: boolean; linked: boolean }>(await api("/api/telegram/link")));
    } catch {
      setSt({ configured: false, linked: false });
    }
  }, [api]);
  useEffect(() => {
    void load();
    const again = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [load]);
  // Get the one-time link before the tap, so the tap opens it straight away (no blank tab).
  const [link, setLink] = useState<{ url: string; at: number } | null>(null);
  const getLink = useCallback(async () => {
    const { url } = await json<{ url: string }>(await api("/api/telegram/link", { method: "POST" }));
    const l = { url, at: Date.now() };
    setLink(l);
    return l;
  }, [api]);
  useEffect(() => {
    if (st?.configured && !st.linked) void getLink().catch(() => {});
  }, [st?.configured, st?.linked, getLink]);
  const connect = async () => {
    try {
      const l = link && Date.now() - link.at < 10 * 60_000 ? link : await getLink();
      await openExternal(l.url);
      setOpened(true);
    } catch {
      /* ignore */
    }
  };
  if (!st) return null;
  return (
    <div className="mb-4 space-y-2 rounded-2xl border border-line p-3" data-testid="telegram">
      <div className="text-[13px] font-semibold">🔔 {s.notifications}</div>
      <p className="text-[12px] leading-relaxed text-fg-muted">{s.tgIntro}</p>
      {!st.configured ? (
        <p className="text-[12px] text-fg-muted">{s.tgNotReady}</p>
      ) : st.linked ? (
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400" data-testid="tg-linked">
            {s.tgConnected}
          </span>
          <button
            onClick={async () => {
              await api("/api/telegram/link", { method: "DELETE" });
              await load();
            }}
            className="text-[12px] text-fg-muted underline"
          >
            {s.tgDisconnect}
          </button>
        </div>
      ) : (
        <>
          <button onClick={connect} className="w-full rounded-xl bg-[#229ED9] py-2 text-sm font-semibold text-white" data-testid="tg-connect">
            ✈️ {s.tgConnect}
          </button>
          {opened && <p className="text-[11px] text-fg-muted">{s.tgOpened}</p>}
        </>
      )}
    </div>
  );
}
