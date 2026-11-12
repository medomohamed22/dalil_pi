import "server-only";
import { piNetwork, piServerCall, type PiPayment } from "./pi";
import { piUsdPrice } from "./price";
import { signToken, verifyToken } from "./sign";
import { supabase, supabaseEnabled } from "./supabase";
import { listPacks, memActivate, PLAN_CATALOG } from "./users";
import type { PaidPlanId, PlanOffer } from "../types";

/**
 * Paid plans with Pi (user → app payments, Pi SDK `createPayment`).
 *
 *  1. GET /api/plans          → live Pi prices (OKX) + a signed quote per plan.
 *  2. Pi.createPayment({ amount, metadata: { plan, quote } })
 *  3. onReadyForServerApproval → POST /api/payments/approve: we read the
 *     payment from Pi's servers, check user, amount and the signed quote,
 *     record it, then approve.
 *  4. onReadyForServerCompletion → POST /api/payments/complete: we check the
 *     txid with Pi, complete, and activate a 30-day pack.
 *
 * Only subscription money comes to the app wallet; product payments go to the stores.
 */

const QUOTE_TTL_MS = 15 * 60_000;

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "PAYMENT_REJECTED",
  ) {
    super(message);
  }
}

interface Quote {
  uid: string;
  plan: PaidPlanId;
  amountPi: number;
  priceUsd: number;
  rate: number;
}

export function isPaidPlan(x: unknown): x is PaidPlanId {
  return typeof x === "string" && Object.hasOwn(PLAN_CATALOG, x);
}

/** Pi price of a USD amount, rounded UP to 0.1 Pi so the app never undercharges. */
export function piAmount(usd: number, rate: number): number {
  return Math.max(0.1, Math.ceil((usd / rate) * 10 - 1e-9) / 10);
}

/** The plan shop with live Pi prices and a signed quote per plan for this user. */
/** Plans (not top-ups) the user already has, with the end of the latest pack of each. */
async function activePlans(uid: string): Promise<Map<PaidPlanId, string>> {
  const out = new Map<PaidPlanId, string>();
  for (const p of await listPacks(uid)) {
    if (p.plan === "topup") continue;
    const cur = out.get(p.plan);
    if (!cur || p.endsAt > cur) out.set(p.plan, p.endsAt);
  }
  return out;
}

export async function planOffers(uid: string): Promise<{ plans: (PlanOffer & { quote: string | null })[]; rate: number | null; network: string }> {
  const [price, active] = await Promise.all([piUsdPrice(), activePlans(uid)]);
  const plans = (Object.keys(PLAN_CATALOG) as PaidPlanId[]).map((id) => {
    const c = PLAN_CATALOG[id];
    const amountPi = price ? piAmount(c.priceUsd, price.usd) : null;
    const activeUntil = active.get(id) ?? null;
    // No quote for a plan the user already has: it can't be bought twice while active.
    const quote = amountPi && !activeUntil ? signToken({ uid, plan: id, amountPi, priceUsd: c.priceUsd, rate: price!.usd } satisfies Quote, QUOTE_TTL_MS) : null;
    return { id, priceUsd: c.priceUsd, searches: c.searches, orders: c.orders, days: c.days, amountPi, quote, activeUntil };
  });
  return { plans, rate: price?.usd ?? null, network: piNetwork() };
}

const sameAmount = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 1e-7;

function expectedNetwork(n?: string): boolean {
  if (!n) return true;
  return piNetwork() === "mainnet" ? !/test/i.test(n) : /test/i.test(n);
}

async function fetchPayment(paymentId: string): Promise<PiPayment> {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(paymentId)) throw new BillingError("Invalid payment id");
  return piServerCall<PiPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

/* ---- local-dev store for payments (no Supabase) ---- */
interface PayRow {
  paymentId: string;
  uid: string;
  plan: PaidPlanId;
  amount: number;
  priceUsd: number;
  rate: number;
  status: "approved" | "completed" | "cancelled";
  txid?: string;
}
const memPays = ((globalThis as unknown as { __dalilPays?: Map<string, PayRow> }).__dalilPays ??= new Map());

async function getPayRow(paymentId: string): Promise<PayRow | null> {
  if (!supabaseEnabled) return memPays.get(paymentId) ?? null;
  const { data, error } = await supabase().from("payments").select("payment_id, pi_uid, plan, amount, price_usd, pi_usd_rate, status, txid").eq("payment_id", paymentId).maybeSingle();
  if (error) throw new Error(`payments: ${error.message}`);
  if (!data) return null;
  return {
    paymentId: data.payment_id,
    uid: data.pi_uid,
    plan: data.plan,
    amount: Number(data.amount),
    priceUsd: Number(data.price_usd),
    rate: Number(data.pi_usd_rate),
    status: data.status,
    txid: data.txid ?? undefined,
  };
}

/** Step 3: check everything against Pi's own record of the payment, then approve. */
export async function approvePayment(uid: string, paymentId: string): Promise<void> {
  const p = await fetchPayment(paymentId);
  if (p.user_uid !== uid) throw new BillingError("This payment belongs to another Pi account", 403);
  if (p.direction && p.direction !== "user_to_app") throw new BillingError("Not a payment to Dalil Pi");
  if (!expectedNetwork(p.network)) throw new BillingError(`Wrong Pi network (${p.network})`);
  if (p.status.cancelled || p.status.user_cancelled) throw new BillingError("The payment was cancelled");

  const existing = await getPayRow(paymentId);
  if (existing && existing.uid !== uid) throw new BillingError("This payment belongs to another Pi account", 403);
  if (p.status.developer_approved) return; // already approved (retry)

  const meta = (p.metadata ?? {}) as { plan?: string; quote?: string };
  const q = verifyToken<Quote>(meta.quote);
  if (!q) throw new BillingError("The price quote expired — please try again", 409, "QUOTE_EXPIRED");
  if (q.uid !== uid || q.plan !== meta.plan || !isPaidPlan(q.plan)) throw new BillingError("The price quote doesn't match this payment");
  if (!sameAmount(p.amount, q.amountPi)) throw new BillingError(`Amount ${p.amount} π doesn't match the quoted ${q.amountPi} π`);
  if (q.plan !== "topup" && (await activePlans(uid)).has(q.plan)) {
    throw new BillingError("You already have this plan — it's active until it ends. Pick another plan or a top-up.", 409, "ALREADY_SUBSCRIBED");
  }

  const row: PayRow = { paymentId, uid, plan: q.plan, amount: q.amountPi, priceUsd: q.priceUsd, rate: q.rate, status: "approved" };
  if (supabaseEnabled) {
    const { error } = await supabase().from("payments").upsert(
      {
        payment_id: paymentId,
        pi_uid: uid,
        amount: q.amountPi,
        memo: p.memo?.slice(0, 200) ?? null,
        metadata: { plan: q.plan },
        plan: q.plan,
        price_usd: q.priceUsd,
        pi_usd_rate: q.rate,
        status: "approved",
        network: piNetwork(),
      },
      { onConflict: "payment_id" },
    );
    if (error) throw new Error(`payments: ${error.message}`);
  } else {
    memPays.set(paymentId, row);
  }
  await piServerCall(`/payments/${encodeURIComponent(paymentId)}/approve`, { method: "POST" });
}

/** Step 4: the user signed the transaction — complete it and activate the 30-day pack. */
export async function completePayment(uid: string, paymentId: string, txid?: string): Promise<PaidPlanId> {
  const row = await getPayRow(paymentId);
  if (!row) throw new BillingError("Unknown payment", 404);
  if (row.uid !== uid) throw new BillingError("This payment belongs to another Pi account", 403);
  const p = await fetchPayment(paymentId);
  if (p.user_uid !== uid) throw new BillingError("This payment belongs to another Pi account", 403);
  if (!p.status.developer_approved) throw new BillingError("The payment wasn't approved");
  if (!sameAmount(p.amount, row.amount)) throw new BillingError("Amount changed");
  const chainTx = p.transaction?.txid;
  if (!chainTx) throw new BillingError("No blockchain transaction yet", 409, "NO_TXID");
  if (txid && txid !== chainTx) throw new BillingError("Transaction id doesn't match");
  // Pi checks the transaction on the blockchain (amount, receiver); no pack before that.
  if (!p.transaction?.verified && !p.status.transaction_verified) throw new BillingError("The blockchain hasn't confirmed the payment yet — try again in a moment", 409, "TX_NOT_VERIFIED");

  if (!p.status.developer_completed) {
    await piServerCall(`/payments/${encodeURIComponent(paymentId)}/complete`, { method: "POST", body: { txid: chainTx } });
  }
  if (supabaseEnabled) {
    const { error } = await supabase().rpc("activate_payment", { p_payment_id: paymentId, p_uid: uid, p_txid: chainTx });
    if (error) throw new Error(`activate: ${error.message}`);
  } else {
    memActivate(uid, row.plan, paymentId);
    memPays.set(paymentId, { ...row, status: "completed", txid: chainTx });
  }
  return row.plan;
}

/**
 * Pi reports an unfinished payment when the user signs in (e.g. the app closed
 * mid-payment). Finish it if it is ours and was paid; otherwise cancel it so a
 * new payment can be made.
 */
export async function resolveIncomplete(uid: string, paymentId: string): Promise<"completed" | "cancelled" | "ignored"> {
  const p = await fetchPayment(paymentId);
  if (p.user_uid !== uid) throw new BillingError("This payment belongs to another Pi account", 403);
  const row = await getPayRow(paymentId);
  if (p.transaction?.txid && row && row.uid === uid) {
    await completePayment(uid, paymentId, p.transaction.txid);
    return "completed";
  }
  if (!p.transaction?.txid && !p.status.cancelled && !p.status.user_cancelled) {
    await piServerCall(`/payments/${encodeURIComponent(paymentId)}/cancel`, { method: "POST" });
    if (supabaseEnabled) await supabase().from("payments").update({ status: "cancelled" }).eq("payment_id", paymentId).eq("pi_uid", uid);
    else if (row) memPays.set(paymentId, { ...row, status: "cancelled" });
    return "cancelled";
  }
  return "ignored";
}

/* ---------------- daily payment check (cron) ---------------- */

export interface PaymentIssue {
  paymentId: string;
  uid: string | null;
  amount: number;
  problem: string;
  at: string;
}
export interface PaymentCheck {
  at: string;
  checked: number;
  fixed: number;
  issues: PaymentIssue[];
}

/**
 * Daily: every payment that didn't finish cleanly is checked against Pi's own record.
 *  - approved + paid on chain but never completed → completed and the pack activated,
 *  - approved and never paid for a day → cancelled at Pi so the user isn't stuck,
 *  - completed but no pack → pack activated (activate_payment is idempotent),
 *  - anything else odd (amount differs, Pi errors) → listed for the owner (Admin → overview).
 */
export async function reconcilePayments(): Promise<PaymentCheck> {
  const out: PaymentCheck = { at: new Date().toISOString(), checked: 0, fixed: 0, issues: [] };
  if (!supabaseEnabled) return out;
  const db = supabase();
  const issue = (r: { payment_id: string; pi_uid: string | null; amount: number | string }, problem: string) =>
    out.issues.push({ paymentId: r.payment_id, uid: r.pi_uid, amount: Number(r.amount), problem, at: out.at });

  const halfHour = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: open } = await db.from("payments").select("payment_id, pi_uid, amount, created_at").eq("status", "approved").lt("created_at", halfHour).limit(50);
  for (const r of open ?? []) {
    out.checked++;
    try {
      const p = await fetchPayment(r.payment_id);
      if (!sameAmount(p.amount, Number(r.amount))) {
        issue(r, `amount at Pi ${p.amount} π ≠ approved ${r.amount} π`);
        continue;
      }
      if (p.status.cancelled || p.status.user_cancelled) {
        await db.from("payments").update({ status: "cancelled" }).eq("payment_id", r.payment_id);
        out.fixed++;
      } else if (p.transaction?.txid && r.pi_uid) {
        await completePayment(r.pi_uid, r.payment_id, p.transaction.txid);
        out.fixed++;
      } else if (Date.now() - Date.parse(r.created_at) > 864e5) {
        await piServerCall(`/payments/${encodeURIComponent(r.payment_id)}/cancel`, { method: "POST" });
        await db.from("payments").update({ status: "cancelled" }).eq("payment_id", r.payment_id);
        out.fixed++;
      }
    } catch (e) {
      issue(r, `could not finish: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  const threeDays = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data: done } = await db.from("payments").select("payment_id, pi_uid, amount, txid").eq("status", "completed").gte("created_at", threeDays).limit(500);
  if (done?.length) {
    const { data: subs } = await db.from("subscriptions").select("payment_id").in("payment_id", done.map((d) => d.payment_id));
    const have = new Set((subs ?? []).map((s) => s.payment_id));
    for (const r of done.filter((d) => !have.has(d.payment_id))) {
      out.checked++;
      const { error } = r.pi_uid ? await db.rpc("activate_payment", { p_payment_id: r.payment_id, p_uid: r.pi_uid, p_txid: r.txid }) : { error: { message: "no user" } };
      if (error) issue(r, `paid but no pack: ${error.message.slice(0, 160)}`);
      else out.fixed++;
    }
  }
  return out;
}
