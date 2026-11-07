"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, Loader2, MapPin, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { countryLabel, flag, formatMoney, type Strings } from "@/lib/i18n";
import type { Address, Lang, Me, Offer, Order } from "@/lib/types";

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
          <motion.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-bg shadow-card sm:bottom-auto sm:top-[6dvh] sm:rounded-3xl"
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <span className="text-sm font-semibold">{title}</span>
              <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Account sheet: plan, addresses, orders ---------------- */

export function AccountSheet({ open, onClose, s, lang, me, api, country }: { open: boolean; onClose: () => void; s: Strings; lang: Lang; me: Me | null; api: Fetch; country: string }) {
  const [tab, setTab] = useState<"plan" | "addresses" | "orders">("plan");
  const { addresses, reload } = useAddresses(api, open && !!me);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const loadOrders = useCallback(async () => {
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
      <div className="mb-3 flex gap-1.5" role="tablist">
        {(["plan", "addresses", "orders"] as const).map((k) => (
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
            {k === "plan" ? s.plan : k === "addresses" ? s.addresses : s.orders}
          </button>
        ))}
      </div>

      {tab === "plan" && u && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-line p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.plan}</div>
            <div className="mt-1 text-xl font-semibold">{s.plans[u.plan] ?? u.plan}</div>
            <div className="mt-0.5 text-xs text-fg-muted">{s.planEnds(date(u.renewsAt))}</div>
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
              </div>
            ))
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Order sheet (from a product card) ---------------- */

export function OrderSheet({ offer, onClose, s, lang, api, country, onDone }: { offer: Offer | null; onClose: () => void; s: Strings; lang: Lang; api: Fetch; country: string; onDone?: () => void }) {
  const { addresses, reload } = useAddresses(api, !!offer);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!offer) {
      setOrder(null);
      setErr("");
      setAdding(false);
      setSelected(null);
    }
  }, [offer]);
  useEffect(() => {
    if (addresses && !selected) setSelected(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null);
    if (addresses && addresses.length === 0) setAdding(true);
  }, [addresses, selected]);

  const create = async () => {
    if (!offer || !selected) return;
    setBusy(true);
    setErr("");
    try {
      const res = await api("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer, addressId: selected }) });
      setOrder((await json<{ order: Order }>(res)).order);
      onDone?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const details = order?.shipping ? formatAddress(order.shipping, lang) : "";

  return (
    <Sheet open={!!offer} title={s.orderTitle} onClose={onClose}>
      {offer && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-bg-soft p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" dir="auto">
                {offer.title}
              </div>
              <div className="text-xs text-fg-muted">{offer.store}</div>
            </div>
            <div className="text-end">
              <div className="font-semibold tabular-nums" dir="ltr">
                {formatMoney(offer.total, offer.currency, lang)}
              </div>
              {offer.totalUsd != null && (
                <div className="text-[11px] text-fg-muted" dir="ltr">
                  ≈ {formatMoney(offer.totalUsd, "USD", lang)}
                </div>
              )}
            </div>
          </div>

          {order ? (
            <div className="space-y-2.5" data-testid="order-done">
              <p className="text-sm">{s.orderSaved}</p>
              <pre className="whitespace-pre-wrap rounded-2xl border border-line p-3 font-sans text-[13px] leading-relaxed" dir="auto">
                {details}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(details);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {}
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-bg-soft"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? s.copied : s.copyDetails}
                </button>
                {order.checkoutUrl && (
                  <a href={order.checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg">
                    {s.openStore} <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
              <p className="text-[11px] text-fg-muted">{s.payDirect}</p>
            </div>
          ) : adding ? (
            <AddressForm
              s={s}
              api={api}
              country={country}
              onCancel={() => setAdding(false)}
              onSaved={async (a) => {
                setAdding(false);
                await reload();
                setSelected(a.id);
              }}
            />
          ) : (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.shipTo}</div>
              <div className="space-y-2" role="radiogroup">
                {addresses === null ? (
                  <Loader2 className="mx-auto size-5 animate-spin text-fg-muted" />
                ) : (
                  addresses.map((a) => <AddressCard key={a.id} a={a} s={s} lang={lang} selected={selected === a.id} onSelect={() => setSelected(a.id)} />)
                )}
                <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2 text-sm hover:bg-bg-soft">
                  <Plus className="size-4" /> {s.addAddress}
                </button>
              </div>
              {err && <p className="text-xs text-danger">{err}</p>}
              <button
                onClick={create}
                disabled={busy || !selected}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />} {s.createOrder}
              </button>
              <p className="text-[11px] text-fg-muted">{s.payDirect}</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
