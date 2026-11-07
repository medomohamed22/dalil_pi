"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { Bell, BellRing, Camera, Play, CircleCheck, Eye, HandCoins, Menu, Package, Zap, Moon, PanelLeft, Plus, Settings2, ShoppingCart, Sun, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, getKV, loadSettings, requestPersistence, saveSettings, setKV, uid } from "@/lib/db";
import {
  authorize,
  capture,
  CheckoutError,
  clearResult,
  createCart,
  captureCart,
  refundPayment,
  createOrder,
  openPayPalWindow,
  PAYPAL_RESULT_KEY,
  readResult,
  voidHold,
  type HoldRecord,
  type PayPalResult,
  type PendingCheckout,
} from "@/lib/paypal-client";
import { t } from "@/lib/i18n";
import {
  DEFAULT_SETTINGS,
  HOLD_MINUTES,
  type AgentEvent,
  type Block,
  type ChatMessage,
  type Offer,
  type Settings,
  type Step,
  type Watch,
  type WatchMode,
  type WireMessage,
  type Negotiation,
  type Conversation,
  type NegotiationEvent,
  type Protection,
  purchaseContext,
} from "@/lib/types";
import type { CartAction } from "./Cart";
import Composer, { type ComposerPayload } from "./Composer";
import Logo from "./Logo";
import MessageView, { type ApprovalAction } from "./MessageView";
import SettingsSheet from "./SettingsSheet";
import DemoTour, { type TourApi } from "./DemoTour";
import SavingsPanel from "./Savings";
import { groupApi } from "./Group";
import { Toasts, WatchesPanel, WatchSheet, type Toast } from "./Watches";
import { enableNotifications, localNotify, registerServiceWorker, watchApi } from "@/lib/watch-client";

/** Convert stored messages into the compact form the model sees. */
function toWire(messages: ChatMessage[]): WireMessage[] {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return messages.slice(-30).map((m) => {
    const parts: string[] = [];
    const images: string[] = [];
    for (const b of m.blocks) {
      if (b.type === "text") parts.push(b.text);
      if (b.type === "link") parts.push(`[link] ${b.preview.url}${b.preview.title ? ` — ${b.preview.title}` : ""}`);
      if (b.type === "image") {
        if (m === lastUser) images.push(b.dataUrl);
        else parts.push("[photo attached earlier]");
      }
      if (b.type === "products")
        parts.push(
          "[Offers shown to user]\n" +
            b.offers
              .map((o, i) => `${i + 1}. ${o.title} | ${o.store} | total ${o.total} ${o.currency} | trust ${o.trust}${o.url ? ` | ${o.url}` : ""}`)
              .join("\n"),
        );
      if (b.type === "approval")
        parts.push(
          `[Purchase approval for "${b.offer.title}" at ${b.offer.store}: ${b.status}${b.tracking ? `, tracking ${b.tracking.trackingNumber}` : ""}${b.refund ? `, refunded (${b.refund.reason})` : ""}]`,
        );
      if (b.type === "cart")
        parts.push(`[Multi-store cart: ${b.offers.map((o) => `"${o.title}" at ${o.store}`).join(", ")}: ${b.status}]`);
      if (b.type === "watchDraft") parts.push(`[Price watch proposed for "${b.offer.title}" at ${b.offer.store}, target ${b.targetPrice ?? "?"}]`);
    }
    return { role: m.role, text: parts.join("\n\n"), images: images.length ? images : undefined };
  });
}

function applyEvent(blocks: Block[], e: AgentEvent): Block[] {
  const next = [...blocks];
  if (e.type === "step") {
    // A single activity block per reply, pinned to the top.
    let idx = next.findIndex((b) => b.type === "steps");
    if (idx === -1) {
      next.unshift({ type: "steps", steps: [], startedAt: Date.now() });
      idx = 0;
    }
    const sb = next[idx] as Extract<Block, { type: "steps" }>;
    const steps: Step[] = [...sb.steps];
    const at = steps.findIndex((x) => x.id === e.step.id);
    if (at >= 0) steps[at] = { ...steps[at], ...e.step, detail: e.step.detail ?? steps[at].detail };
    else steps.push(e.step);
    next[idx] = { ...sb, steps };
  } else if (e.type === "text") {
    const last = next[next.length - 1];
    if (last?.type === "text") next[next.length - 1] = { type: "text", text: last.text + e.delta };
    else next.push({ type: "text", text: e.delta });
  } else if (e.type === "thought") {
    // The streamed narration becomes a note in the activity bar instead of the answer.
    const last = next[next.length - 1];
    if (last?.type === "text") {
      const kept = last.text.endsWith(e.text) ? last.text.slice(0, -e.text.length) : last.text;
      if (kept.trim()) next[next.length - 1] = { type: "text", text: kept };
      else next.pop();
    }
    let idx = next.findIndex((b) => b.type === "steps");
    if (idx === -1) {
      next.unshift({ type: "steps", steps: [], startedAt: Date.now() });
      idx = 0;
    }
    next[idx] = { ...(next[idx] as Extract<Block, { type: "steps" }>), note: e.text.trim().slice(0, 240) };
  } else if (e.type === "block") {
    // Progressive results: a newer offer list replaces the previous cards in place.
    // The live browser view updates in place, too.
    const at =
      e.block.type === "products" || e.block.type === "browser" || e.block.type === "insight"
        ? next.findIndex((b) => b.type === e.block.type)
        : -1;
    let block = e.block;
    if (block.type === "approval" && !block.context) {
      const lists = next.flatMap((b) => (b.type === "products" ? [b.offers] : []));
      block = { ...block, context: purchaseContext(block.offer, lists) };
    }
    if (at >= 0) next[at] = block;
    else next.push(block);
  } else if (e.type === "browserDone") {
    return next.map((b) => (b.type === "browser" ? { ...b, live: false } : b));
  } else if (e.type === "error") {
    next.push({ type: "error", text: e.message });
  }
  return next;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [live, setLive] = useState<ChatMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [dark, setDark] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; n: number }>();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [vaultConnected, setVaultConnected] = useState(false);
  const [storePersistent, setStorePersistent] = useState<boolean | null>(null);
  const [watchesOpen, setWatchesOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  /** Guided demo for judges (also opens with ?demo=1). */
  const [tourOpen, setTourOpen] = useState(false);
  const tourApi = useRef<TourApi | null>(null);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("demo") === "1") setTourOpen(true);
    } catch {}
  }, []);
  const [watchDraft, setWatchDraft] = useState<{ offer: Offer; targetPrice?: number; mode?: WatchMode } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  /** Multi-store cart being filled from product cards (kept on this device). */
  const [cart, setCart] = useState<Offer[]>([]);
  /** Server-provided AI key for visitors without their own (rate-limited). */
  const [hosted, setHosted] = useState(false);
  /** Deployment runs on the PayPal sandbox → show the "simulate a price drop" helpers. */
  const [sandbox, setSandbox] = useState(false);
  const prevStatus = useRef<Map<string, Watch["status"]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** A purchase card to bring into view (e.g. right after tapping "Buy"). */
  const [focusMsg, setFocusMsg] = useState<string | null>(null);
  const convRestored = useRef(false);
  useEffect(() => {
    if (!convRestored.current) return;
    try {
      if (convId) localStorage.setItem("dalil-conv", convId);
      else localStorage.removeItem("dalil-conv");
    } catch {}
  }, [convId]);
  const s = t(settings.lang);
  const ar = settings.lang === "ar";

  useEffect(() => {
    loadSettings().then(async (st) => {
      setSettings(st);
      // Reopen the conversation that was open before a reload (e.g. a purchase on hold).
      try {
        const last = localStorage.getItem("dalil-conv");
        if (last && (await db().conversations.get(last))) setConvId((cur) => cur ?? last);
      } catch {}
      convRestored.current = true;
      setReady(true);
    });
    requestPersistence();
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: { hostedAI?: boolean; sandbox?: boolean }) => {
        setHosted(!!c.hostedAI);
        setSandbox(!!c.sandbox);
      })
      .catch(() => {});
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (!ready) return; // don't overwrite the saved language with the default before settings load
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }, [settings.lang]);

  const toggleTheme = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try {
      localStorage.setItem("dalil-theme", d ? "dark" : "light");
    } catch {}
  };

  const conversations = useLiveQuery(() => db().conversations.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const storedQ =
    useLiveQuery(
      () =>
        convId
          ? db().messages.where("[conversationId+createdAt]").between([convId, 0], [convId, Infinity]).toArray()
          : Promise.resolve([] as ChatMessage[]),
      [convId],
    );
  const stored = useMemo(() => storedQ ?? [], [storedQ]);

  const messages = useMemo(() => {
    if (!live) return stored;
    return [...stored.filter((m) => m.id !== live.id), live];
  }, [stored, live]);

  // Keep scrolled to bottom while streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (focusMsg) return; // a purchase card is being brought into view instead
    if (nearBottom || live) el.scrollTo({ top: el.scrollHeight, behavior: live ? "auto" : "smooth" });
  }, [messages, live, focusMsg]);

  // Tapping "Buy" anywhere: scroll the new purchase card into view and highlight it.
  useEffect(() => {
    if (!focusMsg) return;
    const el = document.getElementById(`msg-${focusMsg}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => setFocusMsg(null), 2200);
    return () => clearTimeout(t);
  }, [focusMsg, messages]);

  const busy = !!live;

  const newChat = () => {
    abortRef.current?.abort();
    setConvId(null);
    setSidebarOpen(false);
  };

  const ensureConversation = async (title: string, icon?: Conversation["icon"]) => {
    if (convId) {
      await db().conversations.update(convId, { updatedAt: Date.now() });
      return convId;
    }
    const id = uid();
    await db().conversations.put({ id, title: title.slice(0, 60) || "…", ...(icon ? { icon } : {}), createdAt: Date.now(), updatedAt: Date.now() });
    setConvId(id);
    return id;
  };

  const send = useCallback(
    async (p: ComposerPayload) => {
      if (busy) return;
      const cid = await ensureConversation(
        p.text || p.links[0]?.title || (ar ? "بحث بالصورة" : "Photo search"),
        !p.text && !p.links.length && p.images.length ? "camera" : undefined,
      );
      const now = Date.now();
      const userBlocks: Block[] = [
        ...p.images.map((dataUrl) => ({ type: "image" as const, dataUrl })),
        ...p.links.map((preview) => ({ type: "link" as const, preview })),
        ...(p.text ? [{ type: "text" as const, text: p.text }] : []),
      ];
      const userMsg: ChatMessage = { id: uid(), conversationId: cid, role: "user", blocks: userBlocks, createdAt: now };
      await db().messages.put(userMsg);

      const convMsgs = await db().messages.where("conversationId").equals(cid).sortBy("createdAt");
      const history = toWire(convMsgs);
      // Signed offers already shown here — the server re-verifies them and lets the agent reuse their prices.
      const knownOffers = convMsgs
        .flatMap((m) => m.blocks.flatMap((b) => (b.type === "products" ? b.offers : b.type === "approval" || b.type === "watchDraft" ? [b.offer] : [])))
        .filter((o) => o?.sig)
        .slice(-60);
      let assistant: ChatMessage = {
        id: uid(),
        conversationId: cid,
        role: "assistant",
        blocks: [{ type: "steps", steps: [], startedAt: Date.now() }],
        createdAt: now + 1,
      };
      setLive(assistant);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let lastSave = 0;
      const persist = async (force = false) => {
        if (!force && Date.now() - lastSave < 500) return;
        lastSave = Date.now();
        await db().messages.put(assistant);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history,
            settings: {
              baseUrl: settings.baseUrl,
              model: settings.model,
              reasoningEffort: settings.reasoningEffort,
              market: settings.market,
              city: settings.city,
              lang: settings.lang,
              demoMode: settings.demoMode,
              coords: settings.coords ?? null,
            },
            offers: knownOffers,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            let ev: AgentEvent;
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }
            if (ev.type === "error" && ev.message === "NO_API_KEY") ev = { ...ev, message: s.needKey };
            if (ev.type === "error" && ev.message === "HOSTED_LIMIT") ev = { ...ev, message: s.hostedLimit };
            assistant = { ...assistant, blocks: applyEvent(assistant.blocks, ev) };
            setLive(assistant);
            persist();
          }
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          assistant = { ...assistant, blocks: applyEvent(assistant.blocks, { type: "error", message: String((err as Error).message ?? err) }) };
        }
      } finally {
        // Mark any still-running steps as done (e.g. after Stop)
        assistant = {
          ...assistant,
          blocks: assistant.blocks.map((b) =>
            b.type === "steps"
              ? { ...b, endedAt: Date.now(), steps: b.steps.map((x) => (x.status === "running" ? { ...x, status: "done" as const } : x)) }
              : b.type === "browser"
                ? { ...b, live: false }
                : b,
          ),
        };
        await persist(true);
        await db().conversations.update(cid, { updatedAt: Date.now() });
        setLive(null);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, settings, convId, s, hosted],
  );

  /** Clicking "Buy" on a product card opens an approval box directly (no LLM round-trip). */
  const onBuy = async (offer: Offer) => {
    if (!convId) return;
    const msgs = await db().messages.where("conversationId").equals(convId).sortBy("createdAt");
    const lists = msgs.flatMap((m) => m.blocks.flatMap((b) => (b.type === "products" ? [b.offers] : [])));
    const id = uid();
    await db().messages.put({
      id,
      conversationId: convId,
      role: "assistant",
      blocks: [{ type: "approval", offer, status: "pending", context: purchaseContext(offer, lists) }],
      createdAt: Date.now(),
    });
    setFocusMsg(id);
  };

  /* ---------------- Multi-store cart ---------------- */

  useEffect(() => {
    getKV<Offer[]>("cart").then((c) => c && setCart(c));
  }, []);
  const saveCart = (c: Offer[]) => {
    setCart(c);
    setKV("cart", c).catch(() => {});
  };
  const inCart = useCallback((o: Offer) => cart.some((x) => x.id === o.id), [cart]);
  const onAddToCart = (o: Offer) => {
    if (cart.some((x) => x.id === o.id)) return saveCart(cart.filter((x) => x.id !== o.id));
    if (cart.length && cart[0].currency !== o.currency) {
      pushToast({ title: ar ? "عملة مختلفة" : "Different currency", body: ar ? "كل السلة لازم تبقى بنفس العملة." : "Everything in one cart must be in the same currency." });
      return;
    }
    if (cart.length >= 10) {
      pushToast({ title: ar ? "السلة مليانة" : "Cart is full", body: ar ? "أقصى حاجة 10 منتجات." : "Up to 10 items per cart." });
      return;
    }
    saveCart([...cart, o]);
  };
  /** "Checkout": put the cart in the chat as one approval card. */
  const checkoutCart = async () => {
    if (!convId || !cart.length) return;
    const id = uid();
    await db().messages.put({ id, conversationId: convId, role: "assistant", blocks: [{ type: "cart", offers: cart, status: "pending" }], createdAt: Date.now() });
    saveCart([]);
    setFocusMsg(id);
  };

  type CartB = Extract<Block, { type: "cart" }>;
  const updateCart = async (msgId: string, idx: number, fn: (b: CartB) => CartB) => {
    const m = await db().messages.get(msgId);
    const b = m?.blocks[idx];
    if (!m || b?.type !== "cart") return;
    let next = fn(b);
    // Every store refunded (cancelled in the window) → the whole cart is cancelled.
    if (next.units?.length && next.status === "held" && next.units.every((u) => u.status === "refunded" || u.status === "voided")) {
      next = { ...next, status: "voided" };
    }
    const blocks = [...m.blocks];
    blocks[idx] = next;
    await db().messages.put({ ...m, blocks });
  };
  const setUnit = (msgId: string, idx: number, unit: number, patch: Partial<NonNullable<CartB["units"]>[number]>) =>
    updateCart(msgId, idx, (b) => ({ ...b, units: b.units?.map((u, i) => (i === unit ? { ...u, ...patch } : u)) }));

  const onCart = async (msgId: string, idx: number, action: CartAction, arg?: number) => {
    if (action === "decline") return updateCart(msgId, idx, (b) => ({ ...b, status: "declined" }));
    if (action === "retry") return updateCart(msgId, idx, (b) => ({ ...b, status: "pending", message: undefined, units: undefined, orderId: undefined }));
    if (action === "remove") return updateCart(msgId, idx, (b) => ({ ...b, offers: b.offers.filter((_, i) => i !== arg) }));
    const popup = action === "approve" ? openPayPalWindow() : null;
    const m = await db().messages.get(msgId);
    const block = m?.blocks[idx];
    if (block?.type !== "cart") {
      popup?.close();
      return;
    }
    if (action === "captureUnit" || action === "captureAll") {
      // Keep: close the cancel window now (the stores are already paid).
      return updateCart(msgId, idx, (b) => ({ ...b, status: "captured" }));
    }
    if (action === "cancelUnit" || action === "cancelAll") {
      // Cart stores are paid on approval; cancelling one inside the window refunds it in full.
      const targets = (block.units ?? []).map((u, i) => ({ u, i })).filter(({ u, i }) => u.status === "captured" && u.captureId && (action === "cancelAll" || i === arg));
      for (const { u, i } of targets) {
        try {
          await refundPayment(u.captureId!, u.captureToken, "cancelled");
          await setUnit(msgId, idx, i, { status: "refunded" });
        } catch (e) {
          await setUnit(msgId, idx, i, { message: (e as Error).message });
        }
      }
      return;
    }
    // approve: one PayPal order for the whole cart
    await updateCart(msgId, idx, (b) => ({ ...b, status: "processing", message: undefined }));
    try {
      const mandate = { maxSpend: settings.maxSpend, verifiedOnly: settings.verifiedOnly };
      const order = await createCart(block.offers, mandate);
      await updateCart(msgId, idx, (b) => ({
        ...b,
        mandate,
        orderId: order.id,
        charge: order.charge,
        units: order.units.map((u) => ({ referenceId: u.referenceId, store: u.store, items: u.items, charge: u.charge, status: "pending" as const })),
      }));
      await setKV("pendingCheckout", { msgId, idx, orderId: order.id, orderToken: order.orderToken, kind: "cart" } satisfies PendingCheckout);
      if (popup && !popup.closed) {
        popup.location.href = order.approveUrl;
        const watch = setInterval(async () => {
          if (!popup.closed) return;
          clearInterval(watch);
          await new Promise((r) => setTimeout(r, 1500));
          const still = await getKV<PendingCheckout>("pendingCheckout");
          if (still?.orderId === order.id) {
            await setKV("pendingCheckout", null);
            await updateCart(msgId, idx, (b) => ({ ...b, status: "pending", units: undefined, orderId: undefined }));
          }
        }, 700);
      } else {
        window.location.href = order.approveUrl;
      }
    } catch (e) {
      popup?.close();
      await updateCart(msgId, idx, (b) => ({ ...b, status: "error", message: (e as Error).message }));
    }
  };

  const onPatchApproval = async (msgId: string, idx: number, patch: { protection?: Protection; familyId?: string }) => {
    await updateBlock(msgId, idx, patch);
  };

  const updateBlock = async (msgId: string, idx: number, patch: Partial<Extract<Block, { type: "approval" }>>) => {
    const m = await db().messages.get(msgId);
    if (!m) return;
    const blocks = [...m.blocks];
    const b = blocks[idx];
    if (b?.type !== "approval") return;
    blocks[idx] = { ...b, ...patch, ...(patch.status === "captured" && !b.capturedAt ? { capturedAt: Date.now() } : {}) };
    await db().messages.put({ ...m, blocks });
    if (patch.status === "captured" && b.watchId) {
      watchApi.action(b.watchId, "purchased").then(({ watch }) => mergeWatch(watch)).catch(() => undefined);
    }
  };

  /** Agent-to-agent negotiation: Dalil's buyer agent talks to the store's seller agent. */
  const negotiateBlock = async (msgId: string, idx: number) => {
    const m = await db().messages.get(msgId);
    const block = m?.blocks[idx];
    if (!m || block?.type !== "approval" || block.status !== "pending" || block.negotiation?.status === "running") return;
    const offer = block.offer;
    // Cheapest trustworthy competitor shown in the same reply — a real argument for the seller.
    const competitor = m.blocks
      .flatMap((b) => (b.type === "products" ? b.offers : []))
      .filter((o) => o.store !== offer.store && o.trust !== "suspicious" && o.currency === offer.currency && o.total < offer.total)
      .sort((a, b) => a.total - b.total)[0];
    let neg: Negotiation = {
      status: "running",
      messages: [],
      original: { price: offer.price, shipping: offer.shipping ?? 0, total: offer.total },
    };
    await updateBlock(msgId, idx, { negotiation: neg });
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer, lang: settings.lang, competitor: competitor ? { store: competitor.store, total: competitor.total } : undefined }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as NegotiationEvent;
          if (ev.type === "typing") neg = { ...neg, typing: ev.from };
          else if (ev.type === "msg") neg = { ...neg, typing: undefined, messages: [...neg.messages, { from: ev.from, text: ev.text, price: ev.price }] };
          else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "done") {
            neg = { ...neg, typing: undefined, status: "done", saved: ev.saved, transport: ev.transport };
            await updateBlock(msgId, idx, ev.offer ? { negotiation: neg, offer: ev.offer } : { negotiation: neg });
            continue;
          }
          await updateBlock(msgId, idx, { negotiation: neg });
        }
      }
    } catch (err) {
      await updateBlock(msgId, idx, { negotiation: { ...neg, typing: undefined, status: "failed" } });
      pushToast({ title: ar ? "التفاوض ماكملش" : "Negotiation failed", body: String((err as Error).message ?? err) });
    }
  };

  /* ---------------- Price watches ---------------- */

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = uid();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 9000);
  }, []);

  const mergeWatch = useCallback((w: Watch) => {
    setWatches((ws) => (ws.some((x) => x.id === w.id) ? ws.map((x) => (x.id === w.id ? w : x)) : [w, ...ws]));
    prevStatus.current.set(w.id, w.status);
  }, []);

  const vaultWaiter = useRef<(() => void) | null>(null);

  const buyFromWatch = useCallback(
    async (w: Watch) => {
      if (!w.triggeredOffer) return;
      let cid = convId;
      if (!cid) {
        cid = uid();
        await db().conversations.put({ id: cid, title: w.title.slice(0, 60), icon: "bell", createdAt: Date.now(), updatedAt: Date.now() });
        setConvId(cid);
      }
      const focusId = uid();
      setFocusMsg(focusId);
      await db().messages.put({
        id: focusId,
        conversationId: cid,
        role: "assistant",
        blocks: [{ type: "approval", offer: w.triggeredOffer, status: "pending", watchId: w.id }],
        createdAt: Date.now(),
      });
      setWatchesOpen(false);
      setSidebarOpen(false);
    },
    [convId],
  );

  // Announce status changes coming from the server (price drop, auto-buy, capture).
  const announce = useCallback(
    (list: Watch[]) => {
      for (const w of list) {
        const before = prevStatus.current.get(w.id);
        prevStatus.current.set(w.id, w.status);
        if (!before || before === w.status) continue;
        const price = w.lastPrice != null ? `${w.lastPrice.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} ${w.currency}` : "";
        if (w.status === "triggered") {
          const title = ar ? `السعر نزل: ${w.title}` : `Price drop: ${w.title}`;
          const body = ar ? `${price} في ${w.store} — تحب تشتري؟` : `${price} at ${w.store} — buy it?`;
          pushToast({ title, body, image: w.image, icon: BellRing, action: { label: ar ? "اشتري" : "Buy", run: () => buyFromWatch(w) } });
          if (document.hidden) localNotify(title, body, `/?watch=${w.id}`, w.image);
        } else if (w.status === "held") {
          const title = ar ? `دليل اشتراه: ${w.title}` : `Dalil bought: ${w.title}`;
          const body = ar ? `المبلغ محجوز — معاك ١٠ دقايق تلغي` : `Funds held — 10 minutes to cancel`;
          pushToast({ title, body, image: w.image, icon: Zap, action: { label: ar ? "عرض" : "View", run: () => setWatchesOpen(true) } });
          if (document.hidden) localNotify(title, body, `/?watch=${w.id}`, w.image);
        } else if (w.status === "bought") {
          pushToast({ title: ar ? `تم الشراء: ${w.title}` : `Purchased: ${w.title}`, image: w.image, icon: Package });
        }
      }
    },
    [ar, pushToast, buyFromWatch],
  );

  const refreshWatches = useCallback(
    async (sync: boolean) => {
      try {
        const r = sync ? await watchApi.sync() : await watchApi.list();
        if (!sync) for (const w of r.watches) prevStatus.current.set(w.id, w.status);
        else announce(r.watches);
        setWatches(r.watches);
        setVaultConnected(r.vaultConnected);
        if (r.persistent != null) setStorePersistent(r.persistent);
      } catch {
        /* offline or server not ready */
      }
    },
    [announce],
  );

  useEffect(() => {
    registerServiceWorker();
    refreshWatches(false);
    if (new URLSearchParams(window.location.search).get("watch")) {
      setWatchesOpen(true);
      window.history.replaceState(null, "", "/");
    }
  }, [refreshWatches]);

  // While the app is open, check watches every 30s (works even without a cron).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden && watches.some((w) => w.status === "active" || w.status === "held")) refreshWatches(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [watches, refreshWatches]);

  const onWatchAction = async (id: string, a: "simulate" | "check" | "cancel" | "capture" | "reactivate") => {
    try {
      const { watch } = await watchApi.action(id, a);
      announce([watch]);
      setWatches((ws) => ws.map((x) => (x.id === id ? watch : x)));
    } catch (e) {
      pushToast({ title: ar ? "حصل خطأ" : "Something went wrong", body: (e as Error).message });
    }
  };

  const onDeleteWatch = async (id: string) => {
    await watchApi.remove(id);
    setWatches((ws) => ws.filter((x) => x.id !== id));
  };

  const connectVault = async () => {
    const popup = openPayPalWindow();
    try {
      const setup = await watchApi.vaultSetup();
      await setKV("pendingVault", { setupTokenId: setup.id });
      const done = new Promise<void>((res) => (vaultWaiter.current = res));
      if (popup && !popup.closed) {
        popup.location.href = setup.approveUrl;
        const watch = setInterval(() => {
          if (popup.closed) {
            clearInterval(watch);
            setTimeout(() => vaultWaiter.current?.(), 2000);
          }
        }, 700);
      } else {
        window.location.href = setup.approveUrl;
      }
      await done;
    } catch (e) {
      popup?.close();
      throw e;
    }
  };

  const createWatch = async (p: { targetPrice: number; mode: WatchMode; maxSpend: number; notifications: boolean }) => {
    if (!watchDraft) return;
    const { watch } = await watchApi.create({
      offer: watchDraft.offer,
      targetPrice: p.targetPrice,
      mode: p.mode,
      maxSpend: p.maxSpend,
      market: settings.market,
      demo: settings.demoMode,
    });
    mergeWatch(watch);
    setWatchDraft(null);
    if (p.notifications) enableNotifications();
    pushToast({
      title: ar ? "بدأت المراقبة" : "Watching",
      icon: Eye,
      body: `${watch.title} · ${ar ? "الهدف" : "target"} ${watch.targetPrice.toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} ${watch.currency}`,
      image: watch.image,
      action: { label: ar ? "عرض" : "View", run: () => setWatchesOpen(true) },
    });
  };

  /* ---------------- PayPal: approve → hold → (10 min) → capture | void ---------------- */

  // The result can arrive via postMessage AND the storage event — handle each order once.
  const handledOrders = useRef(new Set<string>());

  const finishApproval = useCallback(
    async (result: PayPalResult) => {
      if (!result?.orderId || handledOrders.current.has(result.orderId)) return;
      handledOrders.current.add(result.orderId);
      if (result.flow === "vault") {
        const pv = await getKV<{ setupTokenId: string }>("pendingVault");
        await setKV("pendingVault", null);
        clearResult();
        if (result.kind === "approved" && pv) {
          try {
            await watchApi.vaultConfirm(pv.setupTokenId);
            setVaultConnected(true);
            pushToast({ title: ar ? "PayPal اتوصّل للشراء التلقائي" : "PayPal connected for auto-buy", icon: CircleCheck });
          } catch (e) {
            pushToast({ title: ar ? "فشل توصيل PayPal" : "Couldn't connect PayPal", body: (e as Error).message });
          }
        }
        vaultWaiter.current?.();
        return;
      }
      const pending = await getKV<PendingCheckout>("pendingCheckout");
      if (!pending || pending.orderId !== result.orderId) return;
      await setKV("pendingCheckout", null);
      clearResult();
      const { msgId, idx } = pending;
      if (pending.kind === "cart") {
        if (result.kind === "cancelled") {
          await updateCart(msgId, idx, (b) => ({ ...b, status: "pending", units: undefined, orderId: undefined }));
          return;
        }
        try {
          const a = await captureCart(result.orderId, pending.orderToken);
          const windowEnds = Date.now() + HOLD_MINUTES * 60_000;
          await updateCart(msgId, idx, (b) => {
            const units = (b.units ?? []).map((u) => {
              const c = a.units.find((x) => x.referenceId === u.referenceId);
              if (!c) return { ...u, status: "error" as const, message: "No capture returned" };
              return { ...u, status: "captured" as const, captureId: c.captureId, captureToken: c.captureToken, charge: c.amount.value };
            });
            // "held" here = paid, still inside the window where any store can be cancelled for a full refund.
            return { ...b, status: "held", holdExpiresAt: windowEnds, units, shipping: a.shipping, payerEmail: a.payerEmail };
          });
        } catch (e) {
          await updateCart(msgId, idx, (b) => ({ ...b, status: "error", message: (e as Error).message }));
        }
        return;
      }
      if (result.kind === "cancelled") {
        await updateBlock(msgId, idx, { status: "pending", message: undefined });
        return;
      }
      await updateBlock(msgId, idx, { status: "processing" });
      try {
        const a = await authorize(result.orderId, pending.orderToken);
        const captureAt = Date.now() + HOLD_MINUTES * 60_000;
        await updateBlock(msgId, idx, {
          status: "held",
          orderId: a.orderId,
          authorizationId: a.authorizationId,
          holdToken: a.holdToken,
          holdExpiresAt: captureAt,
          shipping: a.shipping,
          payerEmail: a.payerEmail,
          message: undefined,
        });
        const holds = (await getKV<HoldRecord[]>("holds")) ?? [];
        await setKV("holds", [...holds, { msgId, idx, authorizationId: a.authorizationId, holdToken: a.holdToken, captureAt }]);
      } catch (e) {
        await updateBlock(msgId, idx, { status: "error", message: (e as Error).message });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ar, pushToast],
  );

  // Receive the PayPal result from the popup (postMessage / storage event) or after a full redirect.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.source === "dalil-paypal") finishApproval(e.data);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PAYPAL_RESULT_KEY && e.newValue) finishApproval(JSON.parse(e.newValue));
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
    const r = readResult();
    if (r) finishApproval(r);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
    };
  }, [finishApproval]);

  // Capture holds whose cancel window has passed (while the app is open).
  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const holds = (await getKV<HoldRecord[]>("holds")) ?? [];
        const due = holds.filter((h) => h.captureAt <= Date.now());
        if (!due.length) return;
        for (const h of due) {
          try {
            const c = await capture(h.authorizationId, h.holdToken);
            if (h.unit != null) await setUnit(h.msgId, h.idx, h.unit, { status: "captured", captureId: c.id, captureToken: c.captureToken });
            else await updateBlock(h.msgId, h.idx, { status: "captured", captureId: c.id, captureToken: c.captureToken });
          } catch (e) {
            if (h.unit != null) await setUnit(h.msgId, h.idx, h.unit, { status: "error", message: (e as Error).message });
            else await updateBlock(h.msgId, h.idx, { status: "error", message: (e as Error).message });
          }
        }
        const left = ((await getKV<HoldRecord[]>("holds")) ?? []).filter(
          (h) => !due.some((d) => d.authorizationId === h.authorizationId),
        );
        await setKV("holds", left);
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const dropHold = async (authorizationId?: string) => {
    const holds = (await getKV<HoldRecord[]>("holds")) ?? [];
    await setKV("holds", holds.filter((h) => h.authorizationId !== authorizationId));
  };

  const onApproval = async (msgId: string, idx: number, action: ApprovalAction, reason?: string) => {
    if (action === "decline") return updateBlock(msgId, idx, { status: "declined" });
    if (action === "negotiate") return negotiateBlock(msgId, idx);
    if (action === "group") {
      const m0 = await db().messages.get(msgId);
      const b0 = m0?.blocks[idx];
      if (b0?.type !== "approval" || b0.groupId) return;
      try {
        const { group } = await groupApi.create(b0.offer, Number(reason) || 2);
        await updateBlock(msgId, idx, { groupId: group.id });
      } catch (err) {
        pushToast({ title: ar ? "مقدرتش أعمل المجموعة" : "Couldn't create the group", body: String((err as Error).message ?? err) });
      }
      return;
    }
    if (action === "retry") return updateBlock(msgId, idx, { status: "pending", message: undefined });

    // Approve: open the window synchronously (before any await) so popup blockers allow it.
    const popup = action === "approve" ? openPayPalWindow() : null;

    const m = await db().messages.get(msgId);
    const block = m?.blocks[idx];
    if (block?.type !== "approval") {
      popup?.close();
      return;
    }

    if (action === "track" || action === "refund") {
      try {
        if (action === "track") {
          if (!block.orderId || !block.captureId) return;
          const r = await fetch("/api/paypal/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ captureId: block.captureId, captureToken: block.captureToken, store: block.offer.store }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
          await updateBlock(msgId, idx, { tracking: j });
        } else {
          if (!block.captureId) return;
          const r = await fetch("/api/paypal/refund", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ captureId: block.captureId, captureToken: block.captureToken, reason }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
          await updateBlock(msgId, idx, { refund: { ...j, reason: reason ?? "" } });
        }
      } catch (e) {
        pushToast({ title: ar ? "حصل خطأ" : "Something went wrong", body: (e as Error).message });
      }
      return;
    }

    if (action === "cancel" || action === "capture") {
      const authId = block.authorizationId;
      if (!authId) return;
      await updateBlock(msgId, idx, { status: "processing" });
      try {
        await dropHold(authId);
        if (action === "cancel") {
          await voidHold(authId, block.holdToken);
          await updateBlock(msgId, idx, { status: "voided" });
        } else {
          const c = await capture(authId, block.holdToken);
          await updateBlock(msgId, idx, { status: "captured", captureId: c.id, captureToken: c.captureToken });
        }
      } catch (e) {
        await updateBlock(msgId, idx, { status: "error", message: (e as Error).message });
      }
      return;
    }

    await updateBlock(msgId, idx, { status: "processing", message: undefined });
    try {
      const order = await createOrder(block.offer, { maxSpend: settings.maxSpend, verifiedOnly: settings.verifiedOnly });
      await updateBlock(msgId, idx, { mandate: { maxSpend: settings.maxSpend, verifiedOnly: settings.verifiedOnly } });
      await setKV("pendingCheckout", { msgId, idx, orderId: order.id, orderToken: order.orderToken } satisfies PendingCheckout);
      await updateBlock(msgId, idx, { orderId: order.id });
      if (popup && !popup.closed) {
        popup.location.href = order.approveUrl;
        // If the user closes the popup without finishing, restore the buttons.
        const watch = setInterval(async () => {
          if (!popup.closed) return;
          clearInterval(watch);
          await new Promise((r) => setTimeout(r, 1500));
          const still = await getKV<PendingCheckout>("pendingCheckout");
          if (still?.orderId === order.id) {
            await setKV("pendingCheckout", null);
            await updateBlock(msgId, idx, { status: "pending" });
          }
        }, 700);
      } else {
        window.location.href = order.approveUrl; // popup blocked → full redirect; state lives in IndexedDB
      }
    } catch (e) {
      popup?.close();
      const err = e as CheckoutError;
      const friendly: Record<string, string> = ar
        ? {
            PAYPAL_NOT_CONFIGURED: "الدفع بـ PayPal مش متظبط على السيرفر لسه (PAYPAL_CLIENT_ID / SECRET).",
            MANDATE_OVER_LIMIT: "اترفض: الإجمالي أعلى من الحد الأقصى اللي حددته في الإعدادات.",
            MANDATE_UNVERIFIED_STORE: "اترفض: إنت محدد متاجر موثوقة بس.",
            MANDATE_SUSPICIOUS_STORE: "اترفض: المتجر ده مشبوه.",
            OFFER_TAMPERED_OR_EXPIRED: "العرض ده قديم أو اتعدّل — اطلب من دليل يدوّر تاني.",
          }
        : { PAYPAL_NOT_CONFIGURED: "PayPal is not configured on the server yet (PAYPAL_CLIENT_ID / SECRET)." };
      await updateBlock(msgId, idx, { status: "error", message: (err.code && friendly[err.code]) || err.message });
    }
  };

  const deleteConversation = async (id: string) => {
    await db().messages.where("conversationId").equals(id).delete();
    await db().conversations.delete(id);
    if (id === convId) setConvId(null);
  };

  const onSaveSettings = async (st: Settings) => {
    setSettings(st);
    await saveSettings(st);
  };

  // What the guided demo may drive (re-bound every render, so it always sees current state).
  tourApi.current = {
    newChat,
    send: (text) => send({ text, images: [], links: [] }),
    isBusy: () => busy,
    getMaxSpend: () => settings.maxSpend,
    setMaxSpend: (v) => onSaveSettings({ ...settings, maxSpend: v }),
    openWatches: setWatchesOpen,
    openSavings: setSavingsOpen,
    clearCart: () => saveCart([]),
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-tight">{settings.lang === "ar" ? "دليل" : "Dalil"}</span>
        </div>
        <button className="rounded-lg p-1.5 hover:bg-bg-muted md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="px-3">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={newChat}
          className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-sm font-medium shadow-card transition-colors hover:border-line-strong"
        >
          <Plus className="size-4" /> {s.newChat}
        </motion.button>
      </div>
      <div className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.chats}</div>
      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        <AnimatePresence initial={false}>
          {conversations.map((c) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`group flex items-center rounded-lg ${c.id === convId ? "bg-bg-muted" : "hover:bg-bg-muted/60"}`}
            >
              <button
                onClick={() => {
                  setConvId(c.id);
                  setSidebarOpen(false);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-start text-sm"
              >
                {c.icon === "bell" && <Bell className="size-3.5 shrink-0 text-fg-muted" />}
                {c.icon === "camera" && <Camera className="size-3.5 shrink-0 text-fg-muted" />}
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {c.title}
                </span>
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                className="me-1 rounded-md p-1 text-fg-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100 max-md:opacity-60"
                aria-label={s.deleteChat}
              >
                <Trash2 className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </nav>
      <div className="border-t border-line p-2">
        <button
          onClick={() => {
            setSavingsOpen(true);
            setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-bg-muted"
        >
          <HandCoins className="size-4" />
          {ar ? "مشترياتي وتوفيري" : "Purchases & savings"}
        </button>
        <button
          onClick={() => {
            setWatchesOpen(true);
            setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-bg-muted"
        >
          <Bell className="size-4" />
          {s.watches}
          <span className="ms-auto rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums">
            {watches.filter((w) => w.status !== "bought" && w.status !== "cancelled").length}
          </span>
        </button>
        <button
          onClick={() => {
            setSettingsOpen(true);
            setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-bg-muted"
        >
          <Settings2 className="size-4" />
          {s.settings}
          <span className="ms-auto truncate font-mono text-[10px] text-fg-muted" dir="ltr">
            {settings.maxSpend ? `limit $${settings.maxSpend.toLocaleString("en-US")}` : "no limit"}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Desktop sidebar */}
      <AnimatePresence initial={false}>
        {desktopSidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="hidden shrink-0 overflow-hidden border-e border-line bg-bg-soft md:block"
          >
            <div className="h-full w-[272px]">{sidebar}</div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 start-0 z-40 w-[82%] max-w-[300px] border-e border-line bg-bg-soft md:hidden"
              initial={{ x: settings.lang === "ar" ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: settings.lang === "ar" ? "100%" : "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
          <button className="rounded-lg p-2 hover:bg-bg-soft md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <button
            className="hidden rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg md:block"
            onClick={() => setDesktopSidebar((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="size-[18px] rtl:-scale-x-100" />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-[15px] font-semibold">{settings.lang === "ar" ? "دليل" : "Dalil"}</span>
          </div>
          <div className="ms-auto flex items-center gap-1">
            {settings.demoMode && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                Demo
              </span>
            )}
            <button onClick={newChat} className="rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg md:hidden" aria-label={s.newChat}>
              <Plus className="size-5" />
            </button>
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.button
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  onClick={checkoutCart}
                  disabled={!convId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-inv-bg px-3 py-1.5 text-[12px] font-semibold text-inv-fg disabled:opacity-50"
                  aria-label={ar ? "ادفع السلة" : "Check out cart"}
                >
                  <ShoppingCart className="size-3.5" />
                  <motion.span key={cart.length} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="tabular-nums">
                    {cart.length}
                  </motion.span>
                  <span className="hidden sm:inline">{ar ? "· ادفع السلة" : "· Checkout"}</span>
                </motion.button>
              )}
            </AnimatePresence>
            <button
              onClick={() => setTourOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold hover:bg-bg-soft"
              aria-label="Run the guided demo"
            >
              <Play className="size-3.5 fill-current" />
              <span>Demo</span>
            </button>
            <button
              onClick={() => setWatchesOpen(true)}
              className="relative rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg"
              aria-label={ar ? "مراقبة الأسعار" : "Price watches"}
            >
              <Bell className="size-[18px]" />
              {watches.some((w) => w.status === "triggered" || w.status === "held") ? (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className="absolute end-1 top-1 size-2 rounded-full bg-fg"
                />
              ) : null}
            </button>
            <button onClick={toggleTheme} className="rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg" aria-label="Theme">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={dark ? "d" : "l"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} className="block">
                  {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg"
              aria-label={s.settings}
            >
              <Settings2 className="size-[18px]" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-3xl px-4 pb-6">
            {messages.length === 0 ? (
              <EmptyState
                s={s}
                ready={ready}
                needsKey={!hosted}
                onPick={(text) => setPrefill({ text, n: Date.now() })}
                onSettings={() => setSettingsOpen(true)}
                onDemo={() => setTourOpen(true)}
              />
            ) : (
              <div className="space-y-7 pt-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={`scroll-mt-4 rounded-3xl transition-shadow ${focusMsg === m.id ? "focus-flash" : ""}`}
                  >
                  <MessageView
                    msg={m}
                    live={live?.id === m.id}
                    s={s}
                    lang={settings.lang}
                    busy={busy}
                    onBuy={onBuy}
                    onWatch={(o) => setWatchDraft({ offer: o })}
                    onOpenDraft={(d) => setWatchDraft(d)}
                    city={settings.city}
                    onApproval={onApproval}
                    onPatchApproval={onPatchApproval}
                    onCart={onCart}
                    onAddToCart={onAddToCart}
                    inCart={inCart}
                    demo={settings.demoMode}
                  />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
          <div className="mx-auto max-w-3xl">
            <Composer s={s} lang={settings.lang} busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} prefill={prefill} />
            <p className="mt-2 text-center text-[11px] text-fg-muted">{s.tagline} · PayPal</p>
          </div>
        </div>
      </main>

      <SavingsPanel
        open={savingsOpen}
        lang={settings.lang}
        market={settings.market}
        onClose={() => setSavingsOpen(false)}
        onOpenChat={(id) => setConvId(id)}
      />
      <SettingsSheet open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSave={onSaveSettings} />
      <WatchSheet
        offer={watchDraft?.offer ?? null}
        initialTarget={watchDraft?.targetPrice}
        initialMode={watchDraft?.mode}
        lang={settings.lang}
        defaultMaxSpend={settings.maxSpend}
        vaultConnected={vaultConnected}
        onConnectVault={connectVault}
        onCreate={createWatch}
        onClose={() => setWatchDraft(null)}
      />
      <WatchesPanel
        open={watchesOpen}
        watches={watches}
        lang={settings.lang}
        demo={settings.demoMode || sandbox}
        persistent={storePersistent}
        vaultConnected={vaultConnected}
        onClose={() => setWatchesOpen(false)}
        onAction={onWatchAction}
        onBuy={buyFromWatch}
        onDelete={onDeleteWatch}
        onDisconnectVault={async () => {
          await watchApi.vaultDisconnect();
          setVaultConnected(false);
        }}
      />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((x) => x.filter((y) => y.id !== id))} />
      <DemoTour open={tourOpen} onClose={() => setTourOpen(false)} api={tourApi} />
    </div>
  );
}

function EmptyState({
  s,
  ready,
  needsKey,
  onPick,
  onSettings,
  onDemo,
}: {
  s: ReturnType<typeof t>;
  ready: boolean;
  needsKey: boolean;
  onPick: (t: string) => void;
  onSettings: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col items-center justify-center py-10 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
        <Logo size={56} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        {s.emptyTitle}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted"
      >
        {s.emptySub}
      </motion.p>
      {ready && needsKey && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-danger">
          {s.needKey}
        </motion.p>
      )}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        whileTap={{ scale: 0.97 }}
        onClick={onDemo}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-inv-bg px-5 py-2.5 text-sm font-semibold text-inv-fg shadow-card"
      >
        <Play className="size-4 fill-current" />
        Run the guided demo
        <span className="hidden font-normal opacity-70 sm:inline">· every feature, ~5 min</span>
      </motion.button>
      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {s.suggestions.map((q, i) => (
          <motion.button
            key={q}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            whileHover={{ y: -2 }}
            onClick={() => onPick(q)}
            dir="auto"
            className="rounded-2xl border border-line bg-bg px-4 py-3 text-start text-sm text-fg-soft shadow-card transition-colors hover:border-line-strong hover:text-fg"
          >
            {q}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
