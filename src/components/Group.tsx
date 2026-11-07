"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Lock, Share2, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/i18n";
import { openPayPalWindow, PAYPAL_RESULT_KEY, type PayPalResult } from "@/lib/paypal-client";
import type { GroupView, Lang } from "@/lib/types";
import { deviceId } from "@/lib/watch-client";
import Logo from "./Logo";

/* ---------------- API ---------------- */

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-device-id": await deviceId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}
export const groupApi = {
  create: (offer: unknown, shares: number) => call<{ group: GroupView }>("/api/groups", { offer, shares }),
  get: (id: string) => call<{ group: GroupView }>(`/api/groups/${id}`),
  pay: (id: string, name: string) => call<{ orderId: string; approveUrl: string; amount: string; currency: string }>(`/api/groups/${id}/pay`, { name }),
  confirm: (id: string, orderId: string) => call<{ group: GroupView }>(`/api/groups/${id}/confirm`, { orderId }),
  cancel: (id: string) => call<{ group: GroupView }>(`/api/groups/${id}/cancel`, {}),
};

/** Polls a group while it's open. */
export function useGroup(id: string | undefined, intervalMs = 4000) {
  const [group, setGroup] = useState<GroupView | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const { group } = await groupApi.get(id);
      setGroup(group);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);
  return { group, setGroup, error, refresh };
}

/* ---------------- Pieces ---------------- */

const money = (v: string | number, cur: string, lang: Lang) => formatMoney(Number(v), cur, lang);

/** Segmented ring: one arc per share, filled as people pay. */
export function GroupRing({ g, size = 112, lang }: { g: GroupView; size?: number; lang: Lang }) {
  const r = size / 2 - 7;
  const C = 2 * Math.PI * r;
  const gap = g.shares > 1 ? 6 : 0;
  const seg = C / g.shares - gap;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {Array.from({ length: g.shares }, (_, i) => (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-i * (seg + gap)} />
            {i < g.paid && (
              <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fg)" strokeWidth="7" strokeLinecap="round"
                strokeDashoffset={-i * (seg + gap)}
                initial={{ strokeDasharray: `0.01 ${C}` }}
                animate={{ strokeDasharray: `${seg} ${C - seg}` }}
                transition={{ duration: 0.7, delay: 0.1 * i, ease: "easeOut" }} />
            )}
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span key={g.paid} initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-2xl font-bold tabular-nums">
          {g.paid}/{g.shares}
        </motion.span>
        <span className="text-[10.5px] text-fg-muted">{lang === "ar" ? "دفعوا" : "paid"}</span>
      </div>
    </div>
  );
}

function useCountdown(to: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, to - now);
  return { h: Math.floor(ms / 3600_000), m: Math.floor((ms % 3600_000) / 60_000) };
}

export function ShareRow({ url, title, lang, text: custom }: { url: string; title: string; lang: Lang; text?: string }) {
  const ar = lang === "ar";
  const [copied, setCopied] = useState(false);
  const text = custom ?? (ar ? `ادخل معايا في شراء ${title} وندفع سوا عن طريق PayPal: ${url}` : `Chip in with me for ${title} via PayPal: ${url}`);
  return (
    <div className="flex gap-2">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {}
        }}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[13px] font-medium hover:bg-bg-soft"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? (ar ? "اتنسخ" : "Copied") : ar ? "انسخ اللينك" : "Copy link"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[13px] font-medium hover:bg-bg-soft"
      >
        WhatsApp
      </a>
      <button
        onClick={() => navigator.share?.({ title, text, url }).catch(() => {})}
        className="flex items-center justify-center rounded-xl border border-line px-3 hover:bg-bg-soft"
        aria-label={ar ? "مشاركة" : "Share"}
      >
        <Share2 className="size-4" />
      </button>
    </div>
  );
}

/* ---------------- Inside the approval card ---------------- */

export function GroupStarter({ lang, onCreate }: { lang: Lang; onCreate: (shares: number) => Promise<void> }) {
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(3);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-2.5 text-sm font-medium transition-colors hover:bg-bg-soft"
      >
        <Users className="size-4" />
        {ar ? "قسّمها مع أصحابك" : "Split it with friends"}
      </motion.button>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5 rounded-2xl border border-line p-3">
      <div className="flex items-center justify-between text-[13px] font-semibold">
        <span className="flex items-center gap-1.5"><Users className="size-4" /> {ar ? "هتقسموها على كام؟" : "How many people?"}</span>
        <button onClick={() => setOpen(false)} className="rounded-full p-1 text-fg-muted hover:bg-bg-soft" aria-label="Close"><X className="size-3.5" /></button>
      </div>
      <div className="flex gap-1.5" role="radiogroup">
        {[2, 3, 4, 5, 6].map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={n === k}
            onClick={() => setN(k)}
            className={`relative flex-1 rounded-xl py-2 text-sm font-semibold tabular-nums transition-colors ${n === k ? "text-inv-fg" : "border border-line hover:bg-bg-soft"}`}
          >
            {n === k && <motion.span layoutId="group-n" className="absolute inset-0 rounded-xl bg-inv-bg" transition={{ type: "spring", damping: 26, stiffness: 380 }} />}
            <span className="relative">{k}</span>
          </button>
        ))}
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onCreate(n);
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg disabled:opacity-50"
      >
        {busy ? "…" : ar ? "اعمل لينك المجموعة" : "Create group link"}
      </button>
      <p className="text-center text-[11px] leading-snug text-fg-muted">
        {ar ? "كل واحد بيدفع نصيبه بـ PayPal كحجز — ومحدش بيتخصم منه إلا لما الكل يدفع." : "Everyone pays their share as a PayPal hold — nobody is charged until everyone has paid."}
      </p>
    </motion.div>
  );
}

export function GroupMini({ id, lang }: { id: string; lang: Lang }) {
  const ar = lang === "ar";
  const { group: g } = useGroup(id, 5000);
  const url = typeof window !== "undefined" ? `${window.location.origin}/g/${id}` : `/g/${id}`;
  if (!g) return <div className="h-28 animate-pulse rounded-2xl bg-bg-soft" />;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <GroupRing g={g} size={72} lang={lang} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{ar ? "شراء جماعي" : "Group buy"}</div>
          <div className="text-[12px] text-fg-muted">
            {ar ? `${g.shares} أشخاص × ` : `${g.shares} people × `}
            <bdi dir={g.currency === "USD" ? "ltr" : "auto"}>{money(g.shareAmount, g.currency, lang)}</bdi>
          </div>
          <GroupStatusLine g={g} lang={lang} />
        </div>
      </div>
      {g.status === "open" && <ShareRow url={url} title={g.title} lang={lang} />}
      <a href={`/g/${id}`} target="_blank" rel="noopener" className="block w-full rounded-xl bg-inv-bg py-2.5 text-center text-sm font-semibold text-inv-fg">
        {g.status === "open" && !g.organizerPaid ? (ar ? "ادفع نصيبك وتابع المجموعة" : "Pay your share & follow") : ar ? "افتح صفحة المجموعة" : "Open group page"}
      </a>
    </motion.div>
  );
}

function GroupStatusLine({ g, lang }: { g: GroupView; lang: Lang }) {
  const ar = lang === "ar";
  const left = useCountdown(g.expiresAt);
  const t =
    g.status === "completed"
      ? ar ? "اكتملت — اتخصم من الكل والطلب اتأكد" : "Complete — everyone charged, order confirmed"
      : g.status === "cancelled"
        ? ar ? "اتلغت — كل الحجوزات اتفكت" : "Cancelled — all holds released"
        : g.status === "expired"
          ? ar ? "انتهت — كل الحجوزات اتفكت" : "Expired — all holds released"
          : ar ? `مستنيين ${g.shares - g.paid} · باقي ${left.h}س ${left.m}د` : `Waiting for ${g.shares - g.paid} · ${left.h}h ${left.m}m left`;
  return <div className={`mt-0.5 text-[11.5px] ${g.status === "open" ? "text-fg-soft" : "font-medium"}`}>{t}</div>;
}

/* ---------------- Public group page (/g/[id]) ---------------- */

export function GroupPage({ id }: { id: string }) {
  const lang: Lang = "en";
  const ar = false as boolean;
  const { group: g, setGroup, error } = useGroup(id);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"" | "pay" | "confirm" | "cancel">("");
  const [msg, setMsg] = useState("");
  const pending = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [lang, ar]);

  const finish = useCallback(
    async (r: PayPalResult) => {
      if (!pending.current || r.orderId !== pending.current) return;
      pending.current = null;
      if (r.kind !== "approved") {
        setBusy("");
        setMsg(ar ? "اتلغت عملية الدفع." : "Payment cancelled.");
        return;
      }
      setBusy("confirm");
      try {
        const { group } = await groupApi.confirm(id, r.orderId);
        setGroup(group);
        setMsg("");
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        setBusy("");
      }
    },
    [id, ar, setGroup],
  );

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.source === "dalil-paypal") finish(e.data);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PAYPAL_RESULT_KEY && e.newValue) finish(JSON.parse(e.newValue));
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
    };
  }, [finish]);

  async function pay() {
    const popup = openPayPalWindow();
    setBusy("pay");
    setMsg("");
    try {
      const o = await groupApi.pay(id, name);
      pending.current = o.orderId;
      if (popup) popup.location.href = o.approveUrl;
      else window.location.href = o.approveUrl;
    } catch (e) {
      popup?.close();
      setBusy("");
      setMsg((e as Error).message);
    }
  }

  const url = typeof window !== "undefined" ? window.location.href : "";
  const amt = (v: string | number, c: string) => <bdi dir={c === "USD" ? "ltr" : "auto"}>{money(v, c, lang)}</bdi>;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex max-w-md items-center gap-2 px-4 py-4">
        <Logo size={30} />
        <span className="text-[15px] font-semibold">{ar ? "دليل" : "Dalil"}</span>
        <span className="text-[13px] text-fg-muted">· {ar ? "شراء جماعي" : "Group buy"}</span>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pb-10">
        {!g ? (
          error ? (
            <p className="py-20 text-center text-sm text-fg-muted">{ar ? "المجموعة مش موجودة." : "Group not found."}</p>
          ) : (
            <div className="h-80 animate-pulse rounded-3xl bg-bg-soft" />
          )
        ) : (
          <>
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-line shadow-card">
              {g.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.image} alt={g.title} referrerPolicy="no-referrer" className="h-44 w-full bg-white object-contain p-4" />
              ) : null}
              <div className="space-y-1 p-4">
                <div className="text-xs text-fg-muted">{g.store}</div>
                <h1 className="text-[16px] font-semibold leading-snug" dir="auto">{g.title}</h1>
                <div className="text-[13px] text-fg-soft">
                  {ar ? "الإجمالي " : "Total "}
                  {amt(g.total, g.currency)}
                  {g.offerCurrency !== g.currency ? <span className="text-fg-muted"> · {amt(g.offerTotal, g.offerCurrency)}</span> : null}
                </div>
              </div>
            </motion.section>

            <section className="flex items-center gap-4 rounded-3xl border border-line p-4">
              <GroupRing g={g} lang={lang} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[12px] text-fg-muted">{ar ? "نصيب كل واحد" : "Each share"}</div>
                <div className="text-2xl font-bold tabular-nums">{amt(g.shareAmount, g.currency)}</div>
                <GroupStatusLine g={g} lang={lang} />
              </div>
            </section>

            <AnimatePresence mode="wait">
              {g.status === "completed" ? (
                <motion.section key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative overflow-hidden rounded-3xl bg-inv-bg p-5 text-center text-inv-fg">
                  <Confetti />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12 }} className="mx-auto flex size-12 items-center justify-center rounded-full bg-inv-fg text-inv-bg">
                    <Check className="size-6" strokeWidth={3} />
                  </motion.div>
                  <div className="mt-3 text-lg font-semibold">{ar ? "اكتملت المجموعة!" : "Group complete!"}</div>
                  <div className="text-[13px] opacity-75">{ar ? "اتخصم نصيب كل واحد والطلب اتأكد." : "Every share was charged and the order is confirmed."}</div>
                </motion.section>
              ) : g.status === "open" ? (
                <motion.section key="pay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 rounded-3xl border border-line p-4">
                  <label className="block text-[12px] text-fg-muted" htmlFor="gname">{ar ? "اسمك (عشان أصحابك يعرفوا إنك دفعت)" : "Your name (so friends see you paid)"}</label>
                  <input id="gname" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} dir="auto"
                    placeholder={ar ? "مثلًا: أحمد" : "e.g. Alex"}
                    className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-fg" />
                  <motion.button whileTap={{ scale: 0.97 }} onClick={pay} disabled={!!busy}
                    className="w-full rounded-2xl bg-inv-bg py-3.5 text-sm font-semibold text-inv-fg disabled:opacity-50">
                    {busy === "pay" ? (ar ? "بيفتح PayPal…" : "Opening PayPal…") : busy === "confirm" ? (ar ? "بيحجز نصيبك…" : "Holding your share…") : (
                      <>{ar ? "ادفع نصيبك " : "Pay your share "}{amt(g.shareAmount, g.currency)}{ar ? " بـ PayPal" : " with PayPal"}</>
                    )}
                  </motion.button>
                  <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-muted">
                    <Lock className="mt-0.5 size-3 shrink-0" />
                    {ar ? "المبلغ بيتحجز بس — مش هيتخصم إلا لما الكل يدفع. لو المجموعة ما اكتملتش خلال 24 ساعة، الحجز بيتفك لوحده." : "Your money is only held — it's charged when everyone has paid. If the group isn't complete within 24h, the hold is released automatically."}
                  </p>
                  {msg && <p className="text-[12px] text-danger">{msg}</p>}
                </motion.section>
              ) : (
                <motion.section key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-line p-4 text-center text-sm text-fg-soft">
                  {g.status === "cancelled" ? (ar ? "المنظّم لغى المجموعة — كل الحجوزات اتفكت." : "The organizer cancelled — all holds were released.") : (ar ? "المجموعة انتهت قبل ما تكتمل — كل الحجوزات اتفكت." : "The group expired — all holds were released.")}
                </motion.section>
              )}
            </AnimatePresence>

            {g.members.length > 0 && (
              <section className="rounded-3xl border border-line p-4">
                <div className="mb-2 text-[12px] font-semibold text-fg-muted">{ar ? "المشاركين" : "Members"}</div>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {g.members.map((m, i) => (
                      <motion.li key={`${m.name}-${m.at}-${i}`} initial={{ opacity: 0, x: ar ? 10 : -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-soft text-[13px] font-semibold">{m.name.slice(0, 1).toUpperCase()}</span>
                        <span className="min-w-0 flex-1 truncate text-[14px]" dir="auto">
                          {m.name}
                          {m.organizer ? <span className="text-fg-muted"> · {ar ? "المنظّم" : "organizer"}</span> : null}
                        </span>
                        <span className={`rounded-full px-2 text-[11px] leading-5 ${m.status === "held" || m.status === "captured" ? "bg-inv-bg text-inv-fg" : "border border-line text-fg-muted"}`}>
                          {{ pending: ar ? "بيدفع…" : "Paying…", held: ar ? "محجوز" : "Held", captured: ar ? "اتخصم" : "Charged", voided: ar ? "اتفك" : "Released", failed: ar ? "فشل" : "Failed" }[m.status]}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )}

            {g.status === "open" && (
              <section className="space-y-2">
                <div className="text-center text-[12px] text-fg-muted">{ar ? "ابعت اللينك لأصحابك" : "Send the link to your friends"}</div>
                <ShareRow url={url} title={g.title} lang={lang} />
              </section>
            )}

            {g.isOrganizer && g.status === "open" && (
              <button
                disabled={!!busy}
                onClick={async () => {
                  if (!confirm(ar ? "تلغي المجموعة وتفك كل الحجوزات؟" : "Cancel the group and release every hold?")) return;
                  setBusy("cancel");
                  try {
                    setGroup((await groupApi.cancel(id)).group);
                  } catch (e) {
                    setMsg((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
                className="w-full rounded-2xl border border-line py-2.5 text-sm text-fg-soft hover:bg-bg-soft"
              >
                {ar ? "إلغاء المجموعة" : "Cancel group"}
              </button>
            )}
            <p className="text-center text-[11px] text-fg-muted">
              {ar ? "مدعوم بـ PayPal · مفيش حد بيدفع غير نصيبه" : "Powered by PayPal · everyone pays only their share"}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export function Confetti() {
  const bits = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((i) => (
        <motion.span
          key={i}
          className="absolute top-0 block size-1.5 rounded-full bg-inv-fg"
          style={{ left: `${(i * 53) % 100}%` }}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 220, opacity: [0, 1, 1, 0], rotate: 180 }}
          transition={{ duration: 1.6 + (i % 5) * 0.2, delay: (i % 6) * 0.12, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
