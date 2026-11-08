"use client";

import { Loader2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney, type Strings } from "@/lib/i18n";
import type { Lang, Offer, StoreCheck } from "@/lib/types";
import { BottomSheet } from "./cards";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/* ---------------- Universal cart (on this device) ---------------- */

const sigExpired = (o: Offer) => !o.sig || Number(o.sig.split(".")[0]) < Date.now();

export function CartSheet({ open, onClose, s, lang, items, onRemove, onOrder }: { open: boolean; onClose: () => void; s: Strings; lang: Lang; items: Offer[]; onRemove: (id: string) => void; onOrder: (o: Offer) => void }) {
  const stores = [...new Set(items.map((o) => o.store))];
  const piTotal = items.filter((o) => o.currency === "PI").reduce((n, o) => n + o.total, 0);
  const usdTotal = items.reduce((n, o) => n + (o.totalUsd ?? 0), 0);
  return (
    <BottomSheet open={open} title={s.cart} onClose={onClose}>
      <div className="space-y-3" data-testid="cart">
        {!items.length && <p className="py-6 text-center text-sm text-fg-muted">{s.cartEmpty}</p>}
        {stores.map((store) => (
          <div key={store} className="rounded-2xl border border-line p-3">
            <div className="mb-2 text-[13px] font-semibold">{store}</div>
            {items
              .filter((o) => o.store === store)
              .map((o) => {
                const old = sigExpired(o);
                return (
                  <div key={o.id} className="flex items-center gap-2 border-t border-line py-2 first:border-0 first:pt-0" data-testid="cart-item">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-[13px]" dir="auto">
                        {o.title}
                      </div>
                      <div className="text-[12px] font-semibold tabular-nums" dir="ltr">
                        {formatMoney(o.total, o.currency, lang)}
                      </div>
                      {old && <div className="text-[11px] text-danger">{s.cartExpired}</div>}
                    </div>
                    <button disabled={old} onClick={() => onOrder(o)} className="rounded-full bg-inv-bg px-3 py-1 text-[12px] font-semibold text-inv-fg disabled:opacity-40" data-testid="cart-order">
                      {o.checkout === "woo_pi" ? s.autoOrder : s.order}
                    </button>
                    <button onClick={() => onRemove(o.id)} aria-label={s.remove} className="rounded-full p-1.5 text-fg-muted hover:bg-bg-soft">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
          </div>
        ))}
        {!!items.length && (
          <div className="flex items-center justify-between rounded-2xl bg-bg-soft px-3 py-2.5 text-sm" data-testid="cart-total">
            <span>
              {s.cartTotal} · {s.cartStores(stores.length)}
            </span>
            <span className="text-end font-semibold tabular-nums" dir="ltr">
              {formatMoney(Math.round(piTotal * 100) / 100, "PI", lang)}
              {usdTotal > 0 && <span className="block text-[11px] font-normal text-fg-muted">≈ {formatMoney(Math.round(usdTotal * 100) / 100, "USD", lang)}</span>}
            </span>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ---------------- "Is this store safe?" ---------------- */

export function CheckSheet({ open, onClose, s, api }: { open: boolean; onClose: () => void; s: Strings; api: Fetch }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<StoreCheck | null>(null);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      const r = await api("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setRes(j as StoreCheck);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const tone = (v: StoreCheck["verdict"]) => (v === "safe" ? "text-emerald-700 dark:text-emerald-400" : v === "caution" ? "text-amber-700 dark:text-amber-400" : "text-danger");
  const reason = (r: StoreCheck["reasons"][number]) => (s.checkReasons[r.key] ?? r.key).replace("{n}", String(r.value ?? "")).replace("{avg}", String(r.avg ?? "—"));
  return (
    <BottomSheet open={open} title={s.checkStore} onClose={onClose}>
      <div className="space-y-3" data-testid="check">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input.trim().length >= 3 && run()}
            placeholder={s.checkPlaceholder}
            dir="auto"
            className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
          />
          <button onClick={run} disabled={busy || input.trim().length < 3} className="rounded-xl bg-inv-bg px-4 text-sm font-semibold text-inv-fg disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : s.checkBtn}
          </button>
        </div>
        {err && <p className="text-[12px] text-danger">{err}</p>}
        {res && (
          <div className="rounded-2xl border border-line p-3" data-testid="check-result">
            <div className={`flex items-center gap-2 text-base font-semibold ${tone(res.verdict)}`}>
              {res.verdict === "safe" ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
              {s.verdicts[res.verdict]} · <span className="tabular-nums">{res.score}/100</span>
            </div>
            <div className="mt-0.5 truncate text-[12px] text-fg-muted" dir="ltr">
              {res.name}
            </div>
            <ul className="mt-2 space-y-1">
              {res.reasons.map((r, i) => (
                <li key={i} className={`text-[12px] ${r.ok ? "text-fg-soft" : "text-danger"}`}>
                  {r.ok ? "✓" : "✗"} {reason(r)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ---------------- Today's deals (new-chat screen) ---------------- */

interface Deal {
  title: string;
  store: string;
  url: string;
  image?: string;
  price: number;
  was: number;
  currency: string;
  dropPct: number;
}

export function Deals({ s, lang, country }: { s: Strings; lang: Lang; country?: string }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  useEffect(() => {
    fetch(`/api/deals${country ? `?country=${country}` : ""}`)
      .then((r) => r.json())
      .then((j: { deals?: Deal[] }) => setDeals(j.deals ?? []))
      .catch(() => setDeals([]));
  }, [country]);
  if (!deals?.length) return null;
  return (
    <div className="mt-8 w-full max-w-xl text-start" data-testid="deals">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">🔥 {s.deals}</div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {deals.map((d) => (
          <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="w-40 shrink-0 overflow-hidden rounded-2xl border border-line bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.image ? <img src={d.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-24 w-full object-cover" /> : <div className="h-24 bg-bg-muted" />}
            <div className="p-2">
              <div className="line-clamp-2 text-[12px]" dir="auto">
                {d.title}
              </div>
              <div className="mt-1 text-[12px] font-semibold tabular-nums" dir="ltr">
                {formatMoney(d.price, d.currency, lang)} <span className="text-[10px] font-normal text-fg-muted line-through">{formatMoney(d.was, d.currency, lang)}</span>
              </div>
              <div className="text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">−{d.dropPct}% · {d.store}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
