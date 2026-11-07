"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, MousePointerClick, Play, SkipForward, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Guided demo for judges: one button runs every feature end to end on the
 * live PayPal sandbox with the real AI. The tour drives the normal UI (so what
 * the judge sees is exactly what a user gets). Browsers only let PayPal open
 * from a real click, so at payment steps the tour points at the button and
 * waits for the judge — and shows the sandbox buyer login from the server env.
 */

export interface TourApi {
  newChat: () => void;
  send: (text: string) => Promise<void>;
  isBusy: () => boolean;
  getMaxSpend: () => number;
  setMaxSpend: (v: number) => Promise<void>;
  openWatches: (open: boolean) => void;
  openSavings: (open: boolean) => void;
  clearCart: () => void;
}

interface DemoConfig {
  ai: boolean;
  model: string;
  sandbox: boolean;
  buyer: { email: string; password: string } | null;
}

class Stopped extends Error {}
class Skipped extends Error {}

type Phase = "auto" | "you" | "done" | "error";
interface View {
  index: number;
  title: string;
  body: string;
  phase: Phase;
  note?: string;
  needsLogin?: boolean;
}

const STEPS = [
  "Real AI search",
  "Buy now or wait?",
  "Spending mandate",
  "Agent-to-agent negotiation",
  "Approve with PayPal",
  "Hold → capture & trust receipt",
  "Price protection",
  "Price watch",
  "Multi-store cart",
  "Family approval",
  "Group buy",
  "Purchases & savings",
] as const;

const QUERY = "Find the best price for Sony WH-1000XM5 wireless headphones";

/* ---------------- DOM helpers (the tour panel itself is excluded) ---------------- */

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !el.closest("[data-tour-ui]");
};
const labelOf = (el: Element) => (el.getAttribute("aria-label") || (el as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
function buttons(root: ParentNode = document): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].filter(visible);
}
function findButton(re: RegExp, opts: { root?: ParentNode; last?: boolean; enabled?: boolean } = {}): HTMLButtonElement | undefined {
  const list = buttons(opts.root).filter((b) => re.test(labelOf(b)) && (opts.enabled === false || !b.disabled));
  return opts.last ? list[list.length - 1] : list[0];
}
const lastApproval = () => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-approval-card]")].filter(visible);
  return all[all.length - 1];
};
const offerCards = () => [...document.querySelectorAll<HTMLElement>("[data-offer-card]")].filter(visible);
const textIn = (re: RegExp, root: ParentNode = document.querySelector("main") ?? document.body) =>
  re.test(((root as HTMLElement).innerText ?? "").replace(/\s+/g, " "));

/** Set a React-controlled input's value. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function DemoTour({ open, onClose, api }: { open: boolean; onClose: () => void; api: React.MutableRefObject<TourApi | null> }) {
  const [cfg, setCfg] = useState<DemoConfig | null>(null);
  const [started, setStarted] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [copied, setCopied] = useState("");
  const [approverId, setApproverId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const skip = useRef(false);
  const spot = useRef<HTMLElement | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/demo/config")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setCfg({ ai: true, model: "muse-spark-1.3-contributor", sandbox: true, buyer: null }));
  }, [open]);

  const unspot = () => {
    spot.current?.classList.remove("tour-spot");
    spot.current = null;
  };
  const highlight = (el: HTMLElement) => {
    unspot();
    spot.current = el;
    el.classList.add("tour-spot");
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  };

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    unspot();
    setApproverId(null);
    setStarted(false);
    setView(null);
    onClose();
  }, [onClose]);

  useEffect(() => () => abort.current?.abort(), []);

  async function run() {
    const ctl = new AbortController();
    abort.current = ctl;
    const signal = ctl.signal;
    setStarted(true);

    const check = () => {
      if (signal.aborted) throw new Stopped();
      if (skip.current) {
        skip.current = false;
        throw new Skipped();
      }
    };
    const sleep = (ms: number) =>
      new Promise<void>((res, rej) => {
        const t0 = Date.now();
        const tick = () => {
          try {
            check();
          } catch (e) {
            return rej(e);
          }
          if (Date.now() - t0 >= ms) return res();
          setTimeout(tick, 150);
        };
        tick();
      });
    async function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs: number, what: string): Promise<T> {
      const t0 = Date.now();
      for (;;) {
        check();
        const v = fn();
        if (v) return v;
        if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
        await sleep(300);
      }
    }
    const say = (index: number, body: string, phase: Phase = "auto", extra: Partial<View> = {}) =>
      setView({ index, title: STEPS[index], body, phase, ...extra });
    const press = async (el: HTMLElement, pause = 700) => {
      highlight(el);
      await sleep(pause);
      el.click();
    };
    /** Point at a button the judge must click (PayPal needs a real click). */
    const yourTurn = async (index: number, el: HTMLElement, body: string, done: () => boolean, timeoutMs = 8 * 60_000) => {
      highlight(el);
      say(index, body, "you", { needsLogin: true });
      await waitFor(done, timeoutMs, "the PayPal approval");
      unspot();
    };
    const verifiedCards = () => offerCards().filter((c) => c.dataset.trust === "verified");
    const buyFrom = async (card: HTMLElement) => {
      const before = document.querySelectorAll("[data-approval-card]").length;
      const buy = findButton(/^Buy$/, { root: card });
      if (!buy) throw new Error("No Buy button on that offer");
      await press(buy);
      return waitFor(() => document.querySelectorAll("[data-approval-card]").length > before && lastApproval(), 30_000, "the purchase card");
    };

    const steps: Array<() => Promise<void>> = [
      // 0 — search
      async () => {
        const a = api.current!;
        a.newChat();
        a.clearCart();
        await sleep(500);
        say(0, `Dalil asks Meta's ${cfg?.model ?? "muse-spark-1.3-contributor"} model to shop for: “${QUERY}”. It searches the Channel3 catalog and the web, checks prices on store pages and ranks offers by total cost, rating and store trust.`);
        await a.send(QUERY);
        await waitFor(() => !api.current!.isBusy() && offerCards().length > 0, 240_000, "the AI's results");
        if (verifiedCards().length < 2) throw new Error("The AI found fewer than 2 offers from verified stores — run the demo again.");
        highlight(offerCards()[0]);
        say(0, `${offerCards().length} live offers. Every price was seen on a search result or store page — Dalil signs each offer on the server, so the AI can't invent or change a price.`);
        await sleep(5000);
      },
      // 1 — insight
      async () => {
        const card = [...document.querySelectorAll<HTMLElement>("main div")].reverse().find((d) => /^buy now or wait\?/i.test((d.innerText ?? "").trim()) && visible(d));
        if (card) highlight(card);
        say(1, "From the price history Dalil tells you whether to buy now or wait for a sale (e.g. 11.11 or Black Friday) — and can set a price watch for you.");
        await sleep(card ? 5000 : 1500);
      },
      // 2 — mandate
      async () => {
        const a = api.current!;
        const prev = a.getMaxSpend();
        try {
          say(2, "Your spending mandate is enforced by the server, not the AI. Let's set a $5 limit and try to buy…");
          await a.setMaxSpend(5);
          const card = await buyFrom(verifiedCards()[0]);
          const approve = await waitFor(() => findButton(/^Approve with PayPal$/, { root: card }), 15_000, "the PayPal button");
          await press(approve);
          await waitFor(() => textIn(/Blocked by your mandate/, card), 30_000, "the mandate check");
          highlight(card);
          say(2, "Blocked: the server refused the payment because it's above your $5 limit — even though the AI proposed it. Restoring your limit…");
          await sleep(4500);
        } finally {
          await a.setMaxSpend(prev);
        }
        const card = lastApproval();
        const retry = findButton(/^Try again$/, { root: card });
        if (retry) await press(retry, 400);
        await waitFor(() => findButton(/^Approve with PayPal$/, { root: lastApproval() }), 15_000, "the purchase card");
      },
      // 3 — negotiation
      async () => {
        const card = lastApproval();
        const neg = findButton(/negotiate a better price/i, { root: card });
        if (!neg) throw new Skipped();
        say(3, "Dalil negotiates with the store's seller agent (agent-to-agent) and only accepts a deal it can verify and sign.");
        await press(neg);
        await waitFor(() => textIn(/You saved|No better price|the original stands/i), 120_000, "the negotiation");
        say(3, textIn(/You saved/i) ? "Deal! The lower price is signed by the server and becomes the new purchase card." : "The seller held firm — the original price stands.");
        await sleep(4000);
      },
      // 4 — PayPal approval (judge clicks)
      async () => {
        const card = await waitFor(() => {
          const c = lastApproval();
          return c && findButton(/^Approve with PayPal$/, { root: c }) ? c : null;
        }, 30_000, "the purchase card");
        const btn = findButton(/^Approve with PayPal$/, { root: card })!;
        await yourTurn(
          4,
          btn,
          "Your turn: click “Approve with PayPal”. Log in with the sandbox buyer below and approve. PayPal only HOLDS the money (authorization) — nothing is charged yet.",
          () => !!findButton(/^Confirm now$/, { root: lastApproval() ?? document }),
        );
      },
      // 5 — capture + receipt
      async () => {
        const card = lastApproval();
        highlight(card);
        say(5, "The funds are on hold with a 10-minute window to cancel. We'll confirm now → PayPal captures the payment.");
        await sleep(3500);
        const confirm = findButton(/^Confirm now$/, { root: card });
        if (confirm) await press(confirm);
        await waitFor(() => textIn(/Trust receipt/i, card), 60_000, "the capture");
        say(5, "Captured. The trust receipt shows what Dalil checked, the price comparison and the PayPal ids.");
        await sleep(4000);
      },
      // 6 — price protection
      async () => {
        const card = lastApproval();
        const sim = await waitFor(() => findButton(/Simulate price drop/i, { root: card }), 60_000, "price protection");
        say(6, "Price protection: for 14 days Dalil keeps checking the price. If it drops, the difference is refunded automatically as a partial PayPal refund. Simulating a drop on the sandbox…");
        await press(sim);
        await waitFor(() => textIn(/refunded/i, card), 60_000, "the refund");
        highlight(card);
        say(6, "A real partial refund just went back to the buyer's PayPal — no claim, no form.");
        await sleep(4500);
      },
      // 7 — price watch
      async () => {
        const a = api.current!;
        const card = offerCards()[1] ?? offerCards()[0];
        const bell = findButton(/^Watch price$/, { root: card });
        if (!bell) throw new Skipped();
        say(7, "Not ready to buy? Watch the price: Dalil checks it in the background and alerts you (or auto-buys within your mandate).");
        await press(bell);
        const start = await waitFor(() => findButton(/^Start watching$/), 15_000, "the watch form");
        await press(start);
        await sleep(1200);
        a.openWatches(true);
        const sim = await waitFor(() => findButton(/^Simulate price drop$/), 15_000, "the watch");
        await press(sim);
        await waitFor(() => textIn(/Price dropped!/, document.body), 30_000, "the price drop");
        say(7, "Price dropped → you get a push notification with a one-tap “Buy”.");
        await sleep(4000);
        a.openWatches(false);
        await sleep(600);
      },
      // 8 — multi-store cart (judge clicks PayPal)
      async () => {
        const cards = verifiedCards();
        const first = cards[0];
        const second = cards.find((c) => c.dataset.store !== first?.dataset.store);
        if (!first || !second) throw new Skipped();
        say(8, `Multi-store cart: ${first.dataset.store} + ${second.dataset.store} in ONE PayPal approval — each store is charged separately.`);
        api.current!.clearCart();
        await sleep(400);
        for (const c of [first, second]) {
          const add = findButton(/^Add to cart$/, { root: c });
          if (add) await press(add, 500);
        }
        const checkout = await waitFor(() => findButton(/Check out cart/i), 10_000, "the cart");
        await press(checkout);
        const approve = await waitFor(() => findButton(/at once with PayPal/i, { last: true }), 15_000, "the cart card");
        await yourTurn(8, approve, "Your turn: click the cart's PayPal button and approve once for both stores.", () => !!findButton(/Cancel this store/i));
        const cancel = findButton(/Cancel this store/i)!;
        say(8, "Paid — one capture per store. Cancel one store within 10 minutes and only that store is refunded in full:");
        await sleep(2500);
        await press(cancel);
        await waitFor(() => textIn(/Refunded/), 60_000, "the store refund");
        await sleep(3500);
      },
      // 9 — family approval (approver side in a frame, judge clicks PayPal)
      async () => {
        say(9, "Family approval: Dalil drafts the purchase and someone else — a parent, a partner — approves and pays from THEIR own PayPal, within a limit you set.");
        const card = await buyFrom(verifiedCards()[0]);
        const ask = findButton(/^Ask family to approve$/, { root: card });
        if (ask) await press(ask);
        const name = await waitFor(() => card.querySelector<HTMLInputElement>('input[placeholder^="Your name"]'), 10_000, "the family form");
        typeInto(name, "Alex");
        await sleep(400);
        const create = await waitFor(() => findButton(/^Create approval link$/, { root: card }), 10_000, "the family form");
        await press(create);
        const id = await waitFor(() => card.innerHTML.match(/(?:\/|%2F)f(?:\/|%2F)([a-z0-9]{12})/i)?.[1], 20_000, "the approval link");
        say(9, "This link goes to Mom. Here is her screen (as if on her phone):");
        await sleep(1500);
        setApproverId(id);
        const doc = () => frame.current?.contentDocument ?? null;
        const pay = await waitFor(() => {
          const d = doc();
          return d ? findButton(/^Approve & pay/, { root: d }) : null;
        }, 30_000, "the approver page");
        await yourTurn(9, pay, "Your turn (as Mom): click “Approve & pay” and approve in PayPal.", () => textIn(/Funds held/, doc()?.body ?? document.createElement("div")));
        const confirm = await waitFor(() => findButton(/^Confirm now$/, { root: doc()! }), 15_000, "the hold");
        say(9, "Mom's funds are held. She confirms → captured, and you get notified.");
        await sleep(2500);
        confirm.click();
        await waitFor(() => textIn(/Paid!/, doc()?.body ?? document.createElement("div")), 60_000, "the payment");
        await sleep(3500);
        setApproverId(null);
      },
      // 10 — group buy
      async () => {
        say(10, "Group buy: split a purchase with friends. Each one pays their share from their own PayPal; nobody is charged until everyone has paid.");
        const card = await buyFrom(verifiedCards()[0]);
        const split = findButton(/^Split it with friends$/, { root: card });
        if (!split) throw new Skipped();
        await press(split);
        const create = await waitFor(() => findButton(/^Create group link$/, { root: card }), 10_000, "the group form");
        await press(create);
        await waitFor(() => textIn(/Copy link|Open group page/, card), 20_000, "the group link");
        highlight(card);
        say(10, "The group link is ready to share (WhatsApp or copy). Each friend's share is held, then captured together.");
        await sleep(5000);
      },
      // 11 — savings
      async () => {
        const a = api.current!;
        say(11, "Purchases & savings: every purchase, what Dalil saved you vs. the market, refunds from price protection — all from PayPal records.");
        a.openSavings(true);
        await sleep(6500);
        a.openSavings(false);
      },
    ];

    for (let i = 0; i < steps.length; i++) {
      try {
        await steps[i]();
      } catch (e) {
        if (e instanceof Stopped) return;
        if (e instanceof Skipped) {
          unspot();
          setApproverId(null);
          continue;
        }
        unspot();
        setView({ index: i, title: STEPS[i], body: (e as Error).message, phase: "error" });
        return;
      }
    }
    unspot();
    setView({ index: STEPS.length - 1, title: "That's Dalil", body: "Search with real AI, signed prices, a server-enforced mandate, PayPal holds before capture, price protection, watches, one-approval carts, family approval and group buys.", phase: "done" });
  }

  const copy = async (k: string, v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(k);
      setTimeout(() => setCopied(""), 1200);
    } catch {}
  };

  if (!open) return null;
  const login = cfg?.buyer;

  return (
    <>
      {/* Approver's screen (family step) */}
      <AnimatePresence>
        {approverId && (
          <motion.div
            data-tour-frame
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="fixed right-3 top-16 z-[70] h-[70dvh] w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-[2rem] border-[6px] border-fg bg-bg shadow-2xl max-sm:top-3 max-sm:h-[55dvh]"
          >
            <div className="flex items-center justify-between bg-fg px-4 py-1 text-[11px] font-semibold text-bg">
              <span>Mom&apos;s phone</span>
              <span>/f/{approverId}</span>
            </div>
            <iframe ref={frame} name="dalil-demo-approver" src={`/f/${approverId}`} title="Approver's view" className="size-full" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        data-tour-ui
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-md rounded-3xl border border-line bg-bg/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[24rem]"
        role="dialog"
        aria-label="Guided demo"
      >
        {!started ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4" /> Guided demo
              </div>
              <button onClick={stop} className="rounded-full p-1 text-fg-muted hover:bg-bg-soft" aria-label="Close demo">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-[13px] leading-snug text-fg-soft">
              Runs every feature on the live PayPal <b>sandbox</b> with the real AI ({cfg?.model ?? "muse-spark-1.3-contributor"}): search, mandate, negotiation,
              PayPal hold &amp; capture, price protection, price watch, multi-store cart, family approval, group buy and savings. About 5 minutes.
            </p>
            <p className="text-[12px] leading-snug text-fg-muted">
              When PayPal opens, you click — browsers only allow PayPal from a real click. Log in with the sandbox buyer:
            </p>
            <Login login={login} copied={copied} copy={copy} />
            {cfg && !cfg.ai && <p className="text-[12px] text-danger">The AI isn&apos;t configured on this deployment (no Meta key).</p>}
            <button
              onClick={run}
              disabled={!!cfg && !cfg.ai}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg disabled:opacity-40"
            >
              <Play className="size-4" /> Start the demo
            </button>
          </div>
        ) : (
          view && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">
                  {view.phase === "done" ? "Done" : `Step ${view.index + 1} of ${STEPS.length}`}
                </span>
                <div className="flex items-center gap-1">
                  {view.phase !== "done" && view.phase !== "error" && (
                    <button onClick={() => (skip.current = true)} className="rounded-full p-1.5 text-fg-muted hover:bg-bg-soft" aria-label="Skip step" title="Skip step">
                      <SkipForward className="size-4" />
                    </button>
                  )}
                  <button onClick={stop} className="rounded-full p-1.5 text-fg-muted hover:bg-bg-soft" aria-label="Close demo">
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-bg-muted">
                <motion.div className="h-full bg-fg" animate={{ width: `${((view.phase === "done" ? STEPS.length : view.index + 0.5) / STEPS.length) * 100}%` }} />
              </div>
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                {view.phase === "auto" && <Loader2 className="size-4 shrink-0 animate-spin" />}
                {view.phase === "you" && <MousePointerClick className="size-4 shrink-0" />}
                {view.phase === "done" && <Check className="size-4 shrink-0" />}
                {view.title}
              </div>
              <p className={`text-[13px] leading-snug ${view.phase === "error" ? "text-danger" : "text-fg-soft"}`}>{view.body}</p>
              {view.phase === "you" && view.needsLogin && <Login login={login} copied={copied} copy={copy} />}
              {(view.phase === "error" || view.phase === "done") && (
                <button onClick={run} className="w-full rounded-2xl border border-line py-2.5 text-xs font-semibold hover:bg-bg-soft">
                  Run the demo again
                </button>
              )}
            </div>
          )
        )}
      </motion.div>
    </>
  );
}

function Login({ login, copied, copy }: { login: DemoConfig["buyer"] | undefined; copied: string; copy: (k: string, v: string) => void }) {
  if (!login)
    return (
      <div className="rounded-2xl bg-bg-soft px-3 py-2.5 text-[12px] text-fg-muted">Use any PayPal sandbox personal account (developer.paypal.com → Sandbox accounts).</div>
    );
  return (
    <div className="space-y-1.5 rounded-2xl bg-bg-soft p-2.5">
      {(
        [
          ["email", "Email", login.email],
          ["password", "Password", login.password],
        ] as const
      ).map(([k, l, v]) => (
        <div key={k} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-16 shrink-0 text-fg-muted">{l}</span>
          <code className="min-w-0 flex-1 truncate font-mono" dir="ltr">
            {v}
          </code>
          <button onClick={() => copy(k, v)} className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] hover:bg-bg" aria-label={`Copy ${l.toLowerCase()}`}>
            {copied === k ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
        </div>
      ))}
      <p className="text-[10.5px] text-fg-muted">PayPal sandbox test account · play money only</p>
    </div>
  );
}
