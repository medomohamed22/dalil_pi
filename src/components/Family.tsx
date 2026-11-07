"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, HeartHandshake, Lock, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/i18n";
import { openPayPalWindow, PAYPAL_RESULT_KEY, type PayPalResult } from "@/lib/paypal-client";
import type { FamilyView, Lang, Offer } from "@/lib/types";
import { deviceId } from "@/lib/watch-client";
import { Confetti, ShareRow } from "./Group";
import Logo from "./Logo";

/* ---------------- API ---------------- */

/**
 * The guided demo shows the approver's side in an embedded frame named
 * "dalil-demo-approver" — give it its own identity, like a second phone.
 */
async function familyDevice(): Promise<string> {
  if (typeof window !== "undefined" && window.name === "dalil-demo-approver") {
    try {
      let id = sessionStorage.getItem("dalil-demo-approver");
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(24)), (x) => x.toString(16).padStart(2, "0")).join("");
        sessionStorage.setItem("dalil-demo-approver", id);
      }
      return id;
    } catch {}
  }
  return deviceId();
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-device-id": await familyDevice() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}

export const familyApi = {
  create: (offer: Offer, limit: number, name: string, note?: string) => call<{ request: FamilyView }>("/api/family", { offer, limit, name, note }),
  get: (id: string) => call<{ request: FamilyView }>(`/api/family/${id}`),
  pay: (id: string) => call<{ orderId: string; approveUrl: string }>(`/api/family/${id}/pay`, {}),
  confirm: (id: string, orderId: string) => call<{ request: FamilyView }>(`/api/family/${id}/confirm`, { orderId }),
  act: (id: string, action: "decline" | "cancel" | "capture") => call<{ request: FamilyView }>(`/api/family/${id}/action`, { action }),
};

export function useFamily(id: string | undefined, intervalMs = 4000) {
  const [req, setReq] = useState<FamilyView | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setReq((await familyApi.get(id)).request);
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
  return { req, setReq, error, refresh };
}

const money = (v: number | string, cur: string, lang: Lang) => (
  <bdi dir={cur === "USD" ? "ltr" : "auto"}>{formatMoney(cur === "EGP" ? Math.round(Number(v)) : Math.round(Number(v) * 100) / 100, cur, lang)}</bdi>
);

function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function statusText(r: FamilyView, lang: Lang, now: number): string {
  const ar = lang === "ar";
  const left = Math.max(0, (r.holdExpiresAt ?? 0) - now);
  const clock = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  switch (r.status) {
    case "pending":
      return ar ? "مستني الموافقة" : "Waiting for approval";
    case "paying":
      return ar ? "بيوافق في PayPal دلوقتي…" : "Approving in PayPal now…";
    case "held":
      return ar ? `اتوافق${r.approverEmail ? ` من ${r.approverEmail}` : ""} — المبلغ محجوز · بيتخصم بعد ${clock}` : `Approved${r.approverEmail ? ` by ${r.approverEmail}` : ""} — funds held · charged in ${clock}`;
    case "captured":
      return ar ? `اتدفع${r.approverEmail ? ` من ${r.approverEmail}` : ""} — الطلب اتأكد` : `Paid${r.approverEmail ? ` by ${r.approverEmail}` : ""} — order confirmed`;
    case "declined":
      return ar ? "اترفض — ماتخصمش حاجة" : "Declined — nothing was charged";
    case "cancelled":
      return ar ? "اتلغى — ماتخصمش حاجة" : "Cancelled — nothing was charged";
    case "expired":
      return ar ? "انتهى قبل ما حد يوافق" : "Expired without approval";
    default:
      return r.message ?? (ar ? "حصل خطأ" : "Something went wrong");
  }
}

/* ---------------- Inside the approval card ---------------- */

export function FamilyStarter({ lang, offer, initialOpen, onCreated }: { lang: Lang; offer: Offer; initialOpen?: boolean; onCreated: (id: string) => Promise<void> | void }) {
  const ar = lang === "ar";
  const [open, setOpen] = useState(!!initialOpen);
  const round = offer.currency === "EGP" ? Math.ceil(offer.total / 50) * 50 : Math.ceil(offer.total);
  const [limit, setLimit] = useState(String(round));
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!open) {
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-2.5 text-sm font-medium transition-colors hover:bg-bg-soft"
      >
        <HeartHandshake className="size-4" />
        {ar ? "اطلب موافقة العيلة" : "Ask family to approve"}
      </motion.button>
    );
  }
  const lim = Number(limit);
  const over = !(lim > 0) || offer.total > lim;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5 rounded-2xl border border-line p-3">
      <div className="flex items-center justify-between text-[13px] font-semibold">
        <span className="flex items-center gap-1.5">
          <HeartHandshake className="size-4" /> {ar ? "موافقة العيلة" : "Family approval"}
        </span>
        <button onClick={() => setOpen(false)} className="rounded-full p-1 text-fg-muted hover:bg-bg-soft" aria-label="Close">
          <X className="size-3.5" />
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-[11.5px] text-fg-muted">{ar ? `أقصى مبلغ يدفعوه (${offer.currency})` : `Spending limit (${offer.currency})`}</span>
        <input
          inputMode="decimal"
          value={limit}
          onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))}
          dir="ltr"
          className={`w-full rounded-xl border bg-bg px-3 py-2 text-[15px] tabular-nums outline-none focus:border-fg ${over ? "border-danger/60" : "border-line"}`}
        />
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        dir="auto"
        placeholder={ar ? "اسمك (مثلًا: سارة)" : "Your name (e.g. Sara)"}
        className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[14px] outline-none focus:border-fg"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={140}
        dir="auto"
        placeholder={ar ? "رسالة قصيرة (اختياري)" : "A short note (optional)"}
        className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[14px] outline-none focus:border-fg"
      />
      {over && (
        <p className="text-[11.5px] text-danger">
          {ar ? <>الإجمالي {money(offer.total, offer.currency, lang)} أعلى من الحد ده.</> : <>The total {money(offer.total, offer.currency, lang)} is above this limit.</>}
        </p>
      )}
      {err && <p className="text-[11.5px] text-danger">{err}</p>}
      <button
        disabled={busy || over}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            const { request } = await familyApi.create(offer, lim, name, note || undefined);
            await onCreated(request.id);
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded-xl bg-inv-bg py-2.5 text-sm font-semibold text-inv-fg disabled:opacity-50"
      >
        {busy ? "…" : ar ? "اعمل لينك الموافقة" : "Create approval link"}
      </button>
      <p className="text-center text-[11px] leading-snug text-fg-muted">
        {ar
          ? "اللي هتبعتله بيوافق ويدفع من حساب PayPal بتاعه. المبلغ بيتحجز الأول مع 10 دقايق للإلغاء، ومينفعش يعدّي الحد اللي حطيته."
          : "They approve and pay from their own PayPal account. Funds are held first with a 10-minute cancel window, and never above your limit."}
      </p>
    </motion.div>
  );
}

export function FamilyMini({ id, lang }: { id: string; lang: Lang }) {
  const ar = lang === "ar";
  const { req: r, setReq } = useFamily(id, 4000);
  const now = useTick(r?.status === "held");
  const [busy, setBusy] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/f/${id}` : `/f/${id}`;
  if (!r) return <div className="h-24 animate-pulse rounded-2xl bg-bg-soft" />;
  const done = r.status === "captured";
  const shareText = ar
    ? `${r.requesterName} طالب موافقتك على شراء ${r.title} (لحد ${r.limit} ${r.currency}) — راجعه وادفع بـ PayPal: ${url}`
    : `${r.requesterName} is asking you to approve ${r.title} (up to ${r.limit} ${r.currency}) — review and pay with PayPal: ${url}`;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${done || r.status === "held" ? "bg-inv-bg text-inv-fg" : "bg-bg-soft"}`}>
          {done ? <Check className="size-5" /> : r.status === "held" ? <Lock className="size-4" /> : <HeartHandshake className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{ar ? "موافقة العيلة" : "Family approval"}</div>
          <div className="text-[12px] text-fg-muted">
            {ar ? "الحد: " : "Limit: "}
            {money(r.limit, r.currency, lang)}
          </div>
          <div className={`mt-0.5 text-[11.5px] ${done ? "font-semibold" : "text-fg-soft"}`}>{statusText(r, lang, now)}</div>
        </div>
      </div>
      {(r.status === "pending" || r.status === "paying") && <ShareRow url={url} title={r.title} lang={lang} text={shareText} />}
      {(r.status === "pending" || r.status === "paying" || r.status === "held") && r.isRequester && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setReq((await familyApi.act(id, "cancel")).request);
            } catch {
              /* status refresh shows the truth */
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-xl border border-line py-2 text-[12px] text-fg-soft hover:bg-bg-soft disabled:opacity-50"
        >
          {r.status === "held" ? (ar ? "إلغاء وفك الحجز" : "Cancel & release the hold") : ar ? "إلغاء الطلب" : "Cancel request"}
        </button>
      )}
    </motion.div>
  );
}

/* ---------------- Approver page (/f/[id]) ---------------- */

export function FamilyPage({ id }: { id: string }) {
  const lang: Lang = "en";
  const ar = false as boolean;
  const { req: r, setReq, error } = useFamily(id);
  const [busy, setBusy] = useState<"" | "pay" | "confirm" | "decline" | "cancel" | "capture">("");
  const [msg, setMsg] = useState("");
  const pending = useRef<string | null>(null);
  const now = useTick(r?.status === "held");

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [lang, ar]);

  const finish = useCallback(
    async (res: PayPalResult) => {
      if (!pending.current || res.orderId !== pending.current) return;
      pending.current = null;
      if (res.kind !== "approved") {
        setBusy("");
        setMsg(ar ? "اتلغت عملية الدفع." : "Payment cancelled.");
        return;
      }
      setBusy("confirm");
      try {
        setReq((await familyApi.confirm(id, res.orderId)).request);
        setMsg("");
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        setBusy("");
      }
    },
    [id, ar, setReq],
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

  async function approve() {
    const popup = openPayPalWindow();
    setBusy("pay");
    setMsg("");
    try {
      const o = await familyApi.pay(id);
      pending.current = o.orderId;
      if (popup) popup.location.href = o.approveUrl;
      else window.location.href = o.approveUrl;
    } catch (e) {
      popup?.close();
      setBusy("");
      setMsg((e as Error).message);
    }
  }

  async function act(a: "decline" | "cancel" | "capture") {
    setBusy(a);
    setMsg("");
    try {
      setReq((await familyApi.act(id, a)).request);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const left = Math.max(0, (r?.holdExpiresAt ?? 0) - now);
  const clock = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex max-w-md items-center gap-2 px-4 py-4">
        <Logo size={30} />
        <span className="text-[15px] font-semibold">{ar ? "دليل" : "Dalil"}</span>
        <span className="text-[13px] text-fg-muted">· {ar ? "موافقة العيلة" : "Family approval"}</span>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pb-10">
        {!r ? (
          error ? (
            <p className="py-20 text-center text-sm text-fg-muted">{ar ? "الطلب مش موجود." : "Request not found."}</p>
          ) : (
            <div className="h-80 animate-pulse rounded-3xl bg-bg-soft" />
          )
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <div className="text-[13px] text-fg-muted">{ar ? "طلب شراء من" : "A purchase request from"}</div>
              <div className="text-xl font-semibold" dir="auto">
                {r.requesterName}
              </div>
              {r.note && (
                <p className="mx-auto mt-2 max-w-xs rounded-2xl bg-bg-soft px-3 py-2 text-[13px] text-fg-soft" dir="auto">
                  “{r.note}”
                </p>
              )}
            </motion.div>

            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-3xl border border-line shadow-card">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt={r.title} referrerPolicy="no-referrer" className="h-44 w-full bg-white object-contain p-4" />
              ) : null}
              <div className="space-y-3 p-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                    {r.store}
                    {r.trust === "verified" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-line px-1.5 text-[10px]">
                        <ShieldCheck className="size-3" /> {ar ? "متجر موثوق" : "Verified store"}
                      </span>
                    )}
                  </div>
                  <h1 className="text-[16px] font-semibold leading-snug" dir="auto">
                    {r.title}
                  </h1>
                </div>
                <dl className="space-y-1.5 rounded-2xl bg-bg-soft p-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-fg-muted">{ar ? "السعر" : "Item"}</dt>
                    <dd className="tabular-nums">{money(r.price, r.currency, lang)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-muted">{ar ? "الشحن" : "Shipping"}</dt>
                    <dd className="tabular-nums">{r.shipping ? money(r.shipping, r.currency, lang) : ar ? "مجاني" : "Free"}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                    <dt>{ar ? "الإجمالي" : "Total"}</dt>
                    <dd className="tabular-nums">{money(r.total, r.currency, lang)}</dd>
                  </div>
                  {r.charge.currency !== r.currency && (
                    <div className="flex justify-between text-xs text-fg-muted">
                      <dt>{ar ? "المبلغ في PayPal" : "Charged via PayPal"}</dt>
                      <dd className="tabular-nums">{money(r.charge.value, r.charge.currency, lang)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <dt className="text-fg-muted">{ar ? "الحد اللي اتطلب" : "Limit they set"}</dt>
                    <dd className="inline-flex items-center gap-1 tabular-nums">
                      <Check className="size-3" /> {money(r.limit, r.currency, lang)}
                    </dd>
                  </div>
                </dl>
              </div>
            </motion.section>

            <AnimatePresence mode="wait">
              {r.status === "pending" || r.status === "paying" ? (
                <motion.section key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
                  {r.isRequester ? (
                    <p className="rounded-2xl border border-line p-3 text-center text-[13px] text-fg-soft">
                      {ar ? "ده طلبك — ابعت اللينك للي هيوافق. مينفعش توافق على طلبك بنفسك." : "This is your request — send the link to the person who should approve. You can't approve your own request."}
                    </p>
                  ) : (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={approve}
                        disabled={!!busy}
                        className="w-full rounded-2xl bg-inv-bg py-3.5 text-sm font-semibold text-inv-fg disabled:opacity-50"
                      >
                        {busy === "pay" ? (ar ? "بيفتح PayPal…" : "Opening PayPal…") : busy === "confirm" ? (ar ? "بيحجز المبلغ…" : "Holding the funds…") : (
                          <>
                            {ar ? "وافق وادفع " : "Approve & pay "}
                            {money(r.charge.value, r.charge.currency, lang)}
                            {ar ? " بـ PayPal" : " with PayPal"}
                          </>
                        )}
                      </motion.button>
                      <button onClick={() => act("decline")} disabled={!!busy} className="w-full rounded-2xl border border-line py-2.5 text-sm text-fg-soft hover:bg-bg-soft disabled:opacity-50">
                        {ar ? "ارفض" : "Decline"}
                      </button>
                      <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-fg-muted">
                        <Lock className="mt-0.5 size-3 shrink-0" />
                        {ar
                          ? "بتدفع من حساب PayPal بتاعك. المبلغ بيتحجز الأول بس، وقدامك 10 دقايق تلغي ويرجع فورًا. السعر متوقّع من دليل ومينفعش يعدّي الحد."
                          : "You pay from your own PayPal account. The money is only held at first — you have 10 minutes to cancel and release it. The price is signed by Dalil and can't exceed the limit."}
                      </p>
                    </>
                  )}
                </motion.section>
              ) : r.status === "held" ? (
                <motion.section key="held" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 rounded-3xl border border-line p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Lock className="size-4" /> {ar ? "المبلغ محجوز" : "Funds held"}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums" dir="ltr">
                      <Clock className="size-3.5" /> {clock}
                    </span>
                  </div>
                  <p className="text-[12px] text-fg-muted">
                    {ar ? "هيتخصم تلقائيًا لما الوقت يخلص. لو غيرت رأيك، الغي ويرجع فورًا." : "It's charged automatically when the timer ends. Changed your mind? Cancel to release it instantly."}
                  </p>
                  {r.isApprover && (
                    <div className="flex gap-2">
                      <button onClick={() => act("decline")} disabled={!!busy} className="flex-1 rounded-2xl border border-fg py-2.5 text-xs font-semibold disabled:opacity-50">
                        {ar ? "إلغاء وفك الحجز" : "Cancel & release"}
                      </button>
                      <button onClick={() => act("capture")} disabled={!!busy} className="flex-1 rounded-2xl bg-inv-bg py-2.5 text-xs font-semibold text-inv-fg disabled:opacity-50">
                        {ar ? "أكّد الدفع دلوقتي" : "Confirm now"}
                      </button>
                    </div>
                  )}
                </motion.section>
              ) : r.status === "captured" ? (
                <motion.section key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative overflow-hidden rounded-3xl bg-inv-bg p-5 text-center text-inv-fg">
                  <Confetti />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12 }} className="mx-auto flex size-12 items-center justify-center rounded-full bg-inv-fg text-inv-bg">
                    <Check className="size-6" strokeWidth={3} />
                  </motion.div>
                  <div className="mt-3 text-lg font-semibold">{ar ? "اتدفع!" : "Paid!"}</div>
                  <div className="text-[13px] opacity-75">{ar ? `${r.requesterName} هيعرف إنك وافقت.` : `${r.requesterName} will see that you approved.`}</div>
                </motion.section>
              ) : (
                <motion.section key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-line p-4 text-center text-sm text-fg-soft">
                  {statusText(r, lang, now)}
                </motion.section>
              )}
            </AnimatePresence>
            {msg && <p className="text-center text-[12px] text-danger">{msg}</p>}
            <p className="text-center text-[11px] text-fg-muted">{ar ? "مدعوم بـ PayPal · دليل مابيدفعش غير بموافقتك" : "Powered by PayPal · Dalil only pays with your approval"}</p>
          </>
        )}
      </main>
    </div>
  );
}
