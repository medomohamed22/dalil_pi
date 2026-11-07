"use client";

import { CalendarClock } from "lucide-react";
import { formatMoney } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

/**
 * Pay Later hint on the approval card. The buyer picks PayPal Pay Later
 * (Pay in 4 / Pay Monthly) inside the PayPal window — verified in Sandbox.
 * (PayPal's JS messages SDK threw page errors and never rendered for this
 * integration, so this is a plain, reliable line instead.)
 */
export default function PayLaterMessage({ amount, currency, lang }: { amount: number; currency: string; lang: Lang }) {
  if (!(currency === "USD" && amount >= 30 && amount <= 10000)) return null;
  const ar = lang === "ar";
  const inFour = amount <= 1500;
  const part = formatMoney(Math.round((amount / 4) * 100) / 100, "USD", "en");
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[12px] text-fg-soft" dir="auto">
      <CalendarClock className="size-3.5 shrink-0" />
      <span>
        {inFour
          ? ar
            ? <>قسّطها مع <bdi><b className="font-semibold text-fg">PayPal Pay Later</b></bdi> — 4 دفعات × <bdi dir="ltr">{part}</bdi> من غير فوايد — اختار «Pay Later» في شباك PayPal</>
            : <>Pay later with <b className="font-semibold text-fg">PayPal</b>: 4 interest-free payments of {part} — choose “Pay Later” in the PayPal window</>
          : ar
            ? <>قسّطها شهريًا مع <bdi><b className="font-semibold text-fg">PayPal Pay Monthly</b></bdi> — اختار «Pay Later» في شباك PayPal</>
            : <>Pay monthly with <b className="font-semibold text-fg">PayPal Pay Later</b> — choose “Pay Later” in the PayPal window</>}
      </span>
    </div>
  );
}
