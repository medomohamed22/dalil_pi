"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import { PAYPAL_RESULT_KEY, type PayPalResult } from "@/lib/paypal-client";

/**
 * PayPal redirects here after approval/cancel. We hand the result back to the
 * Dalil tab (localStorage event + postMessage) and close the popup. If there is
 * no opener (popup blocked → full-page redirect), we go back to the app, which
 * picks the result up on load.
 */
export default function PayPalBridge({ kind }: { kind: PayPalResult["kind"] }) {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const flow = p.get("flow") === "vault" ? "vault" : "order";
    const result: PayPalResult = {
      kind,
      flow,
      orderId: (flow === "vault" ? p.get("approval_token_id") : null) ?? p.get("token") ?? "",
      payerId: p.get("PayerID") ?? undefined,
      t: Date.now(),
    };
    try {
      localStorage.setItem(PAYPAL_RESULT_KEY, JSON.stringify(result));
    } catch {}
    try {
      window.opener?.postMessage({ source: "dalil-paypal", ...result }, window.location.origin);
    } catch {}
    const id = setTimeout(() => {
      if (window.opener) {
        window.close();
        setClosed(true);
      } else {
        window.location.replace("/");
      }
    }, 500);
    return () => clearTimeout(id);
  }, [kind]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
      <Logo size={48} spinning={!closed} />
      <p className="text-sm text-fg-muted">
        {kind === "approved" ? "Approved — returning to Dalil…" : "Cancelled — returning to Dalil…"}
        <br />
        {kind === "approved" ? "تمت الموافقة — بنرجعك لدليل…" : "اتلغى — بنرجعك لدليل…"}
      </p>
      {closed && (
        <Link href="/" className="text-sm underline underline-offset-4">
          Back to Dalil
        </Link>
      )}
    </div>
  );
}
