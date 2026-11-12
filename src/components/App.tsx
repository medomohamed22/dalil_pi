"use client";

import { AnimatePresence, m } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Check, Globe2, House, Loader2, LogOut, MapPin, Menu, Moon, PanelLeft, Plus, Search, ShieldCheck, ShoppingCart, Sun, Trash2, UserRound, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, delKV, getKV, loadSettings, requestPersistence, saveSettings, setKV, uid } from "@/lib/db";
import { countryLabel, flag, t, type Strings } from "@/lib/i18n";
import { inPiBrowser, loadPi, PI_SANDBOX, piAuthenticate } from "@/lib/pi-client";
import { DEFAULT_SETTINGS, type AgentEvent, type Block, type ChatMessage, type Lang, type Me, type Offer, type Scope, type Settings, type Step, type Usage, type WireMessage } from "@/lib/types";
import dynamic from "next/dynamic";

// Account / plans / order sheets load on first use, not with the first page.
const AccountSheet = dynamic(() => import("./Account").then((x) => x.AccountSheet), { ssr: false });
const AutoOrderSheet = dynamic(() => import("./Account").then((x) => x.AutoOrderSheet), { ssr: false });
import type { ComposerPayload } from "./Composer";
import Logo from "./Logo";

import { AnimatedCheck } from "./cards";
import { Deals } from "./Extras";
import { track } from "@/lib/track";
import { AskFab, BottomNav, ShopViews, useScrollTopOn, viewFromUrl, viewKey, viewToUrl, type NavTab, type View } from "./Shop";

// The AI chat loads when "Ask Dalil" opens (the shop is the first screen now).
const Composer = dynamic(() => import("./Composer"), { ssr: false, loading: () => <div className="h-14 rounded-3xl border border-line bg-bg-soft" /> });
const MessageView = dynamic(() => import("./MessageView"), { ssr: false });
const CartSheet = dynamic(() => import("./Extras").then((x) => x.CartSheet), { ssr: false });
const CheckSheet = dynamic(() => import("./Extras").then((x) => x.CheckSheet), { ssr: false });

interface Config {
  ai: boolean;
  pi: { configured: boolean; network: "testnet" | "mainnet" };
  database: boolean;
  devLogin: boolean;
  geo: { country: string; city?: string; source: string; currency: string };
  piPrice: { usd: number; at: number } | null;
  freeLimits: { searches: number; orders: number };
}

const SESSION_KEY = "pi-session";

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
      if (b.type === "shops") parts.push("[Salla Local shops shown to user]\n" + b.shops.map((x, i) => `${i + 1}. ${x.name}${x.distanceKm != null ? ` | ${x.distanceKm} km` : ""}${x.address ? ` | ${x.address}` : ""}`).join("\n"));
      if (b.type === "products")
        parts.push(
          "[Offers shown to user]\n" +
            b.offers.map((o, i) => `${i + 1}. ${o.title} | ${o.store} | total ${o.total} ${o.currency} | trust ${o.trust}${o.url ? ` | ${o.url}` : ""}`).join("\n"),
        );
    }
    return { role: m.role, text: parts.join("\n\n"), images: images.length ? images : undefined };
  });
}

function applyEvent(blocks: Block[], e: AgentEvent): Block[] {
  const next = [...blocks];
  const stepsIndex = () => {
    let idx = next.findIndex((b) => b.type === "steps");
    if (idx === -1) {
      next.unshift({ type: "steps", steps: [], startedAt: Date.now() });
      idx = 0;
    }
    return idx;
  };
  if (e.type === "step") {
    const idx = stepsIndex();
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
    const last = next[next.length - 1];
    if (last?.type === "text") {
      const kept = last.text.endsWith(e.text) ? last.text.slice(0, -e.text.length) : last.text;
      if (kept.trim()) next[next.length - 1] = { type: "text", text: kept };
      else next.pop();
    }
    const idx = stepsIndex();
    next[idx] = { ...(next[idx] as Extract<Block, { type: "steps" }>), note: e.text.trim().slice(0, 240) };
  } else if (e.type === "block") {
    const at = e.block.type === "products" || e.block.type === "shops" || e.block.type === "browser" ? next.findIndex((b) => b.type === e.block.type) : -1;
    if (at >= 0) next[at] = e.block;
    else next.push(e.block);
  } else if (e.type === "browserDone") {
    return next.map((b) => (b.type === "browser" ? { ...b, live: false } : b));
  } else if (e.type === "error") {
    next.push({ type: "error", text: e.message, code: e.code });
  }
  return next;
}

/** A few countries offered first in the picker (the rest come from the full list). */
const TOP_COUNTRIES = ["EG", "US", "SA", "AE", "NG", "IN", "PK", "PH", "VN", "ID", "CN", "KR", "MY", "GB", "DE", "FR", "TR", "MA", "DZ", "KE"];
const ALL_COUNTRIES = (() => {
  const codes: string[] = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) codes.push(String.fromCharCode(a, b));
  return codes;
})();

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [convId, setConvId] = useState<string | null>(null);
  const [live, setLive] = useState<ChatMessage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [countryOpen, setCountryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which screen: the shop (no AI) by default; "ask" is the AI chat. Kept in the URL for Back.
  const [view, setView] = useState<View>({ v: "home" });
  const pushed = useRef(0);
  const [guest, setGuest] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const lang: Lang = settings.lang;
  const s = t(lang);
  const ar = lang === "ar";

  /* ---------- boot ---------- */
  useEffect(() => {
    requestPersistence();
    // Some in-app browsers stall IndexedDB; never let that keep the page empty.
    const fallback = setTimeout(() => setReady(true), 2500);
    loadSettings()
      .then(async (st) => {
        setSettings(st);
        const saved = await getKV<string>(SESSION_KEY);
        if (saved) setToken(saved);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(fallback);
        setReady(true);
      });
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => setConfig(c))
      .catch(() => {});
    setDark(document.documentElement.classList.contains("dark"));
    void loadPi();
    setView(viewFromUrl(window.location.search));
    void getKV<boolean>("guest").then((g) => g && setGuest(true));
    const onPop = () => {
      pushed.current = Math.max(0, pushed.current - 1);
      setView(viewFromUrl(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((v: View) => {
    const url = viewToUrl(v);
    if (url === window.location.pathname + window.location.search) return setView(v);
    window.history.pushState(null, "", url);
    pushed.current++;
    setView(v);
  }, []);
  const back = useCallback(() => {
    if (pushed.current > 0) window.history.back();
    else go({ v: "home" });
  }, [go]);
  useScrollTopOn(viewKey(view), scrollRef);

  // Language: English by default, Arabic switches the whole page to RTL.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const authFetch = useCallback(
    (url: string, init: RequestInit = {}) =>
      fetch(url, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }),
    [token],
  );

  // Load the signed-in user (and drop an expired session).
  useEffect(() => {
    if (!token) return;
    authFetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) {
          setToken(null);
          setMe(null);
          await delKV(SESSION_KEY);
          return;
        }
        if (r.ok) setMe((await r.json()) as Me);
      })
      .catch(() => {});
  }, [token, authFetch]);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      void saveSettings(next);
      return next;
    });
    if (token && (patch.country !== undefined || patch.lang !== undefined)) {
      void authFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(patch.country !== undefined ? { country: patch.country } : {}), ...(patch.lang ? { lang: patch.lang } : {}) }),
      }).catch(() => {});
    }
  };

  // A country saved on the Pi account wins over this device's setting.
  useEffect(() => {
    if (me?.country && me.country !== settings.country) setSettings((cur) => ({ ...cur, country: me.country }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.country]);

  const country = settings.country ?? config?.geo.country ?? "US";

  const toggleTheme = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try {
      localStorage.setItem("dalil-theme", d ? "dark" : "light");
    } catch {}
  };

  /* ---------- sign in ---------- */
  const finishSignIn = async (res: Response) => {
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.token) throw new Error(j.error || `HTTP ${res.status}`);
    setToken(j.token);
    setMe(j.me as Me);
    await setKV(SESSION_KEY, j.token);
  };

  const signIn = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const accessToken = await piAuthenticate();
      await finishSignIn(await fetch("/api/auth/pi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }) }));
    } catch (err) {
      const msg = (err as Error).message;
      setAuthError(msg === "PI_SDK_UNAVAILABLE" || msg === "PI_AUTH_TIMEOUT" ? s.openInPiBrowser : msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const devSignIn = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await finishSignIn(await fetch("/api/auth/pi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dev: "tester" }) }));
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setToken(null);
    setMe(null);
    await delKV(SESSION_KEY);
  };

  /* ---------- chats ---------- */
  const conversations = useLiveQuery(() => db().conversations.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const storedQ = useLiveQuery(
    () => (convId ? db().messages.where("[conversationId+createdAt]").between([convId, 0], [convId, Infinity]).toArray() : Promise.resolve([] as ChatMessage[])),
    [convId],
  );
  const stored = useMemo(() => storedQ ?? [], [storedQ]);
  const messages = useMemo(() => (live ? [...stored.filter((m) => m.id !== live.id), live] : stored), [stored, live]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom || live) el.scrollTo({ top: el.scrollHeight, behavior: live ? "auto" : "smooth" });
  }, [messages, live]);

  const busy = !!live;

  const newChat = () => {
    abortRef.current?.abort();
    setConvId(null);
    setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    await db().messages.where("conversationId").equals(id).delete();
    await db().conversations.delete(id);
    if (convId === id) setConvId(null);
  };

  const ensureConversation = async (title: string, icon?: "camera") => {
    if (convId) {
      await db().conversations.update(convId, { updatedAt: Date.now() });
      return convId;
    }
    const id = uid();
    await db().conversations.put({ id, title: title.slice(0, 60) || "…", ...(icon ? { icon } : {}), createdAt: Date.now(), updatedAt: Date.now() });
    setConvId(id);
    return id;
  };

  const errorText = (code: string | undefined, fallback: string, usage?: Usage) => {
    if (code === "QUOTA_EXCEEDED") {
      const date = usage ? new Date(usage.renewsAt).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "long" }) : "";
      return `${s.quotaTitle}. ${s.quotaSub(date)}`;
    }
    if (code === "HOURLY_LIMIT") return s.hourly;
    if (code === "NO_API_KEY") return s.needKey;
    if (code === "SIGN_IN_REQUIRED") return s.signInRequired;
    if (fallback === "HOSTED_LIMIT") return s.hostedLimit;
    if (code && s.errorCodes[code]) return s.errorCodes[code];
    if (/failed to fetch|load failed|networkerror|network error/i.test(fallback)) return s.errorCodes.NETWORK;
    return fallback;
  };

  const send = useCallback(
    async (p: ComposerPayload) => {
      if (busy || !token) return;
      const cid = await ensureConversation(p.text || p.links[0]?.title || (ar ? "بحث بالصورة" : "Photo search"), !p.text && !p.links.length && p.images.length ? "camera" : undefined);
      const now = Date.now();
      const userBlocks: Block[] = [
        ...p.images.map((dataUrl) => ({ type: "image" as const, dataUrl })),
        ...p.links.map((preview) => ({ type: "link" as const, preview })),
        ...(p.text ? [{ type: "text" as const, text: p.text }] : []),
      ];
      await db().messages.put({ id: uid(), conversationId: cid, role: "user", blocks: userBlocks, createdAt: now });

      const convMsgs = await db().messages.where("conversationId").equals(cid).sortBy("createdAt");
      const history = toWire(convMsgs);
      const knownOffers = convMsgs
        .flatMap((m) => m.blocks.flatMap((b) => (b.type === "products" ? b.offers : [])))
        .filter((o) => o?.sig)
        .slice(-60);
      let assistant: ChatMessage = { id: uid(), conversationId: cid, role: "assistant", blocks: [{ type: "steps", steps: [], startedAt: Date.now() }], createdAt: now + 1 };
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
        const res = await authFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history,
            settings: { lang, country: settings.country, scope: settings.scope, coords: settings.coords ?? null, prefs: settings.prefs ?? null },
            offers: knownOffers,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          if (j.usage) setMe((cur) => (cur ? { ...cur, usage: j.usage } : cur));
          if (res.status === 401) await signOut();
          throw Object.assign(new Error(errorText(j.code, j.error || `HTTP ${res.status}`, j.usage)), { code: j.code });
        }
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
            if (ev.type === "usage") {
              const usage = ev.usage;
              setMe((cur) => (cur ? { ...cur, usage } : cur));
              continue;
            }
            if (ev.type === "error") ev = { ...ev, message: errorText(ev.code, ev.message) };
            assistant = { ...assistant, blocks: applyEvent(assistant.blocks, ev) };
            setLive(assistant);
            void persist();
          }
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          const e = err as Error & { code?: string };
          assistant = { ...assistant, blocks: applyEvent(assistant.blocks, { type: "error", message: errorText(e.code, e.message ?? String(err)), code: e.code }) };
        }
      } finally {
        assistant = {
          ...assistant,
          blocks: assistant.blocks
            .filter((b) => !(b.type === "steps" && b.steps.length === 0 && assistant.blocks.some((x) => x.type === "error")))
            .map((b) =>
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
    [busy, token, settings, convId, lang],
  );

  /** Actions that need a Pi account: a guest is shown the sign-in screen first. */
  const needAuth = (): boolean => {
    if (token) return false;
    setGuest(false);
    void setKV("guest", false);
    return true;
  };
  /** Ask Dalil (AI): a fresh chat with this question. */
  const askDalil = (text?: string) => {
    if (needAuth()) return;
    abortRef.current?.abort();
    setConvId(null);
    go({ v: "ask" });
    if (text) setPendingAsk(text);
  };
  useEffect(() => {
    if (pendingAsk && view.v === "ask" && convId === null && !busy && token) {
      const text = pendingAsk;
      setPendingAsk(null);
      void send({ text, images: [], links: [] });
    }
  }, [pendingAsk, view.v, convId, busy, token, send]);

  /* ---------- UI pieces ---------- */
  const usage = me?.usage;
  const left = usage ? Math.max(0, usage.searchLimit - usage.searchesUsed) : null;
  // Orders are free (only AI requests use credit): never block the Order button.
  const ordersLeft = null;

  /**
   * "Order" on a product card: open the product page in the store right away
   * (inside the click, so the browser doesn't block it), then save and count
   * the order on our server. The user pays the store directly.
   */
  const [autoOffer, setAutoOffer] = useState<Offer | null>(null);
  const [accountTab, setAccountTab] = useState<"watch" | "shop" | undefined>();
  // Universal cart across Pi stores (kept on this device).
  const [cart, setCart] = useState<Offer[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  useEffect(() => {
    void getKV<Offer[]>("cart").then((c) => c && setCart(c));
  }, []);
  const saveCart = (next: Offer[]) => {
    setCart(next);
    void setKV("cart", next);
  };
  const addToCart = (o: Offer) => {
    if (!cart.some((x) => x.id === o.id || (x.url === o.url && x.store === o.store))) saveCart([...cart, o].slice(-30));
  };
  const askShop = async (merchantId: string, question: string): Promise<boolean> => {
    const r = await authFetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchantId, question }) });
    if (!r.ok) setNotice((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.ok;
  };
  // Link from the merchants page: /?shop=1 opens "My shop" once signed in.
  useEffect(() => {
    if (!me || typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("shop") === "1") {
      setAccountTab("shop");
      setAccountOpen(true);
      u.searchParams.delete("shop");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  }, [me]);
  const [drops, setDrops] = useState(0);
  // Price drops on watched products since the last visit.
  useEffect(() => {
    if (!me) return;
    authFetch("/api/watches")
      .then((r) => (r.ok ? r.json() : { watches: [] }))
      .then((j: { watches?: { newDrop: boolean }[] }) => setDrops((j.watches ?? []).filter((w) => w.newDrop).length))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.uid]);
  /** "Watch price" from a product: saved on the server with the signed price. */
  const watch = async (o: Offer, targetPrice?: number | null): Promise<boolean> => {
    const r = await authFetch("/api/watches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: o, targetPrice: targetPrice ?? null }) });
    if (!r.ok) setNotice((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.ok;
  };
  const [offline, setOffline] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  // First sign-in on this device: a 3-step tour.
  useEffect(() => {
    if (!me) return;
    void getKV<boolean>("tour-done").then((done) => !done && setTourStep(0));
  }, [me]);
  const endTour = () => {
    setTourStep(null);
    void setKV("tour-done", true);
  };

  /** A question asked from inside a result (e.g. "ask this shop"). */
  const followUp = (text: string) => void send({ text, images: [], links: [] });
  /** Re-sends the last question after an error. */
  const retry = () => {
    const lastUser = [...messages].reverse().find((x) => x.role === "user");
    const text = lastUser?.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
    if (text) void send({ text, images: [], links: [] });
  };
  const order = (o: Offer) => {
    if (!o.url) return;
    // Stores whose checkout takes Pi: confirm what we send, then Dalil Pi places the order there.
    if (o.checkout === "woo_pi") {
      setNotice("");
      setAutoOffer(o);
      return;
    }
    window.open(o.url, "_blank", "noopener,noreferrer");
    track("order", o, token);
    setNotice("");
    void authFetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: o }), keepalive: true })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (j.usage) setMe((cur) => (cur ? { ...cur, usage: j.usage } : cur));
        if (!r.ok) setNotice(`${s.orderFailed} ${j.error ?? r.status}`);
      })
      .catch((e) => setNotice(`${s.orderFailed} ${(e as Error).message}`));
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-tight">{s.appName}</span>
        </div>
        <button className="rounded-lg p-1.5 hover:bg-bg-muted md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="px-3">
        <m.button
          whileTap={{ scale: 0.98 }}
          onClick={newChat}
          className="flex w-full items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-sm font-medium shadow-card transition-colors hover:border-line-strong"
        >
          <Plus className="size-4" /> {s.newChat}
        </m.button>
      </div>
      <div className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">{s.chats}</div>
      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        <AnimatePresence initial={false}>
          {conversations.map((c) => (
            <m.div
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
            </m.div>
          ))}
        </AnimatePresence>
      </nav>
      <div className="space-y-1 border-t border-line p-2 text-sm">
        {me && (
          <button
            onClick={() => {
              setCheckOpen(true);
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-bg-muted"
          >
            <ShieldCheck className="size-4" />
            {s.checkStore}
          </button>
        )}
        {me && (
          <button
            onClick={() => {
              setAccountOpen(true);
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-bg-muted"
          >
            <UserRound className="size-4" />
            {s.account}
            {me.usage && <span className="ms-auto rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold">{s.plans[me.usage.plan] ?? me.usage.plan}</span>}
          </button>
        )}
        {me && (
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-inv-bg text-[11px] font-semibold text-inv-fg">π</span>
            <span className="min-w-0 flex-1 truncate" dir="ltr">
              @{me.username ?? me.uid.slice(0, 8)}
            </span>
            <button onClick={signOut} className="rounded-md p-1 text-fg-muted hover:text-fg" aria-label={s.signOut} title={s.signOut}>
              <LogOut className="size-3.5 rtl:-scale-x-100" />
            </button>
          </div>
        )}
        {config?.piPrice && (
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] text-fg-muted">
            <span>{s.piPrice} (OKX)</span>
            <span className="font-mono tabular-nums" dir="ltr">
              1 π ≈ ${config.piPrice.usd.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <AnimatePresence initial={false}>
        {desktopSidebar && (
          <m.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="hidden shrink-0 overflow-hidden border-e border-line bg-bg-soft md:block"
          >
            <div className="h-full w-[272px]">{sidebar}</div>
          </m.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <m.div className="fixed inset-0 z-30 bg-black/30 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} />
            <m.aside
              className="fixed inset-y-0 start-0 z-40 w-[82%] max-w-[300px] border-e border-line bg-bg-soft md:hidden"
              initial={{ x: ar ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: ar ? "100%" : "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              {sidebar}
            </m.aside>
          </>
        )}
      </AnimatePresence>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
          <button className="rounded-lg p-2 hover:bg-bg-soft md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <button className="hidden rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg md:block" onClick={() => setDesktopSidebar((v) => !v)} aria-label="Toggle sidebar">
            <PanelLeft className="size-[18px] rtl:-scale-x-100" />
          </button>
          {view.v === "ask" ? (
            <button onClick={() => go({ v: "home" })} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-semibold hover:bg-bg-soft" aria-label={s.navHome} data-testid="go-home">
              <House className="size-[18px]" /> <span className="hidden sm:inline">{s.navHome}</span>
            </button>
          ) : (
            <button onClick={() => go({ v: "home" })} className="flex items-center gap-1.5 whitespace-nowrap text-[16px] font-bold tracking-tight" data-testid="brand">
              <Logo size={26} /> {s.appName}
            </button>
          )}
          <div className="ms-auto flex items-center gap-1">
            {/* Country: flag + code */}
            <button
              onClick={() => setCountryOpen(true)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] font-semibold hover:bg-bg-soft"
              aria-label={s.country}
              title={`${s.shoppingIn} ${countryLabel(country, lang)}`}
            >
              <span aria-hidden>{flag(country)}</span>
              <span dir="ltr">{country}</span>
            </button>
            {/* Language: small circle with the other language's code */}
            <button
              onClick={() => updateSettings({ lang: ar ? "en" : "ar" })}
              className="flex size-9 items-center justify-center rounded-full border border-line text-[11px] font-bold tracking-wide hover:bg-bg-soft"
              aria-label={s.language}
              title={ar ? "English" : "العربية"}
            >
              <span dir="ltr">{ar ? "EN" : "AR"}</span>
            </button>
            {/* Cart */}
            {me && (
              <button
                onClick={() => setCartOpen(true)}
                className="relative flex size-9 items-center justify-center rounded-full border border-line hover:bg-bg-soft"
                aria-label={s.cart}
                title={s.cart}
                data-testid="cart-btn"
              >
                <ShoppingCart className="size-[17px]" />
                {cart.length > 0 && <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">{cart.length}</span>}
              </button>
            )}
            {/* Account */}
            {me && (
              <button
                onClick={() => setAccountOpen(true)}
                className="flex size-9 items-center justify-center rounded-full bg-inv-bg text-inv-fg hover:opacity-90"
                aria-label={s.account}
                title={s.account}
              >
                <UserRound className="size-[18px]" />
              </button>
            )}
            <button onClick={toggleTheme} className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-bg-soft hover:text-fg" aria-label="Theme">
              {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-3xl px-4 pb-6">
            {!ready ? null : !token && (!guest || view.v === "ask") ? (
              <SignIn
                s={s}
                busy={authBusy}
                error={authError}
                devLogin={!!config?.devLogin}
                sandbox={PI_SANDBOX}
                hint={!inPiBrowser() && !config?.devLogin ? s.openInPiBrowser : ""}
                onSignIn={signIn}
                onDevSignIn={devSignIn}
                onGuest={() => {
                  setGuest(true);
                  void setKV("guest", true);
                  if (view.v === "ask") go({ v: "home" });
                }}
              />
            ) : view.v !== "ask" && !settings.country && !config ? (
              // Wait for the visitor's country before searching (no wasted US search first).
              <div className="mt-24 flex justify-center" aria-busy="true">
                <Loader2 className="size-6 animate-spin text-fg-muted" />
              </div>
            ) : view.v !== "ask" ? (
              <ShopViews
                view={view}
                go={go}
                back={back}
                s={s}
                lang={lang}
                country={country}
                onAsk={askDalil}
                coords={settings.coords}
                onLocate={() =>
                  navigator.geolocation?.getCurrentPosition(
                    (pos) => updateSettings({ coords: { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 } }),
                    () => {},
                    { timeout: 10_000, maximumAge: 10 * 60_000 },
                  )
                }
                actions={{
                  onOrder: (o) => !needAuth() && order(o),
                  ordersLeft,
                  onWatch: async (o, target) => (needAuth() ? false : watch(o, target)),
                  onCart: (o) => !needAuth() && addToCart(o),
                  inCart: (id) => cart.some((x) => x.id === id),
                  onAskShop: async (mid, q) => (needAuth() ? false : askShop(mid, q)),
                }}
              />
            ) : messages.length === 0 ? (
              <EmptyState
                s={s}
                lang={lang}
                needsKey={config ? !config.ai : false}
                onPick={(text) => setPrefill({ text, n: Date.now() })}
                onCheck={() => setCheckOpen(true)}
                country={country}
                forYou={[...new Set([...conversations.map((c) => c.title), ...(settings.prefs?.brands ? settings.prefs.brands.split(",").map((b) => b.trim()) : [])].filter((t) => t && t.length < 60))].slice(0, 4)}
              />
            ) : (
              <div className="space-y-7 pt-4">
                {messages.map((m, idx) => (
                  <div key={m.id} id={`msg-${m.id}`}>
                    <MessageView
                      msg={m}
                      live={live?.id === m.id}
                      s={s}
                      lang={lang}
                      city={config?.geo.city}
                      onOrder={order}
                      ordersLeft={ordersLeft}
                      onRetry={idx === messages.length - 1 && !busy ? retry : undefined}
                      onWatch={watch}
                      onAsk={busy ? undefined : followUp}
                      onCart={addToCart}
                      inCart={(id) => cart.some((x) => x.id === id)}
                      onAskShop={askShop}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {ready && (token || guest) && (view.v === "home" || view.v === "search") && <AskFab s={s} onClick={() => askDalil()} />}
        </div>

        {token && view.v === "ask" && (
          <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
            <div className="mx-auto max-w-3xl">
              <ScopeBar
                s={s}
                scope={settings.scope}
                onChange={(scope) => {
                  updateSettings({ scope });
                  // "Near me": ask for the location once. Rounded to ~1 km — it is shared with the AI model.
                  if (scope === "local" && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => updateSettings({ coords: { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 } }),
                      () => {},
                      { timeout: 10_000, maximumAge: 10 * 60_000 },
                    );
                  }
                }}
              />
              {usage && left === 0 && !busy ? (
                // No AI credit: Ask Dalil needs a plan or an AI top-up (search & orders stay free).
                <m.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="rounded-3xl border border-line bg-bg-soft p-4 text-center" data-testid="ai-paywall">
                  <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Wallet className="size-5" />
                  </div>
                  <div className="text-[15px] font-semibold">{s.aiPaywallTitle}</div>
                  <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-fg-muted">{s.aiPaywallSub}</p>
                  <button
                    onClick={() => {
                      setAccountTab(undefined);
                      setAccountOpen(true);
                    }}
                    className="mt-3 rounded-full bg-inv-bg px-5 py-2.5 text-[14px] font-semibold text-inv-fg"
                    data-testid="paywall-plans"
                  >
                    {s.aiPaywallBtn}
                  </button>
                </m.div>
              ) : (
                <Composer s={s} lang={lang} busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} prefill={prefill} />
              )}
              {notice && (
                <p className={`mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] ${notice === s.autoDone ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-danger"}`} dir="auto" role="status">
                  {notice === s.autoDone && <AnimatedCheck size={16} />}
                  {notice}
                </p>
              )}
              <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-fg-muted">
                {usage && left != null && (
                  <span className={`rounded-full px-2 py-0.5 tabular-nums ${left === 0 ? "bg-danger/10 text-danger" : "bg-bg-soft"}`} data-testid="usage">
                    {s.searchesLeft(left, usage.searchLimit)}
                  </span>
                )}
                {drops > 0 && (
                  <button
                    onClick={() => {
                      setAccountTab("watch");
                      setAccountOpen(true);
                    }}
                    className="rounded-full bg-emerald-600 px-2.5 py-0.5 font-semibold text-white"
                    data-testid="drops"
                  >
                    📉 {s.priceDropped(drops)}
                  </button>
                )}
                {usage && left === 0 && (
                  <button onClick={() => setAccountOpen(true)} className="rounded-full bg-inv-bg px-2.5 py-0.5 font-semibold text-inv-fg" data-testid="see-plans">
                    {s.seePlans}
                  </button>
                )}
                <span className="hidden sm:inline">{s.tagline}</span>
              </div>
            </div>
          </div>
        )}
        {ready && (token || guest) && view.v !== "ask" && (
          <BottomNav
            s={s}
            active={view.v === "home" || view.v === "search" ? "home" : view.v === "stores" || view.v === "store" ? "stores" : view.v === "services" ? "services" : null}
            watchBadge={drops}
            onNav={(tab: NavTab) => {
              if (tab === "home") go({ v: "home" });
              else if (tab === "stores") go({ v: "stores" });
              else if (tab === "services") go({ v: "services" });
              else if (!needAuth()) {
                setAccountTab(tab === "watch" ? "watch" : undefined);
                setAccountOpen(true);
              }
            }}
          />
        )}
      </main>

      {offline && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-danger px-3 py-1.5 text-center text-[12px] font-medium text-white" role="status" data-testid="offline">
          {s.offline}
        </div>
      )}
      <AnimatePresence>
        {tourStep != null && (
          <m.div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-4 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <m.div
              key={tourStep}
              role="dialog"
              aria-label={s.tour[tourStep].t}
              data-testid="tour"
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-3xl bg-bg p-5"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-inv-bg text-inv-fg">
                {(() => {
                  const Icon = [Search, ShieldCheck, Wallet][tourStep] ?? Search;
                  return <Icon className="size-5" />;
                })()}
              </div>
              <div className="text-base font-semibold">{s.tour[tourStep].t}</div>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{s.tour[tourStep].d}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1">
                  {s.tour.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all ${i === tourStep ? "w-5 bg-fg" : "w-1.5 bg-line"}`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={endTour} className="px-2 text-sm text-fg-muted">
                    {s.skip}
                  </button>
                  <button
                    onClick={() => (tourStep + 1 < s.tour.length ? setTourStep(tourStep + 1) : endTour())}
                    className="rounded-full bg-inv-bg px-4 py-1.5 text-sm font-semibold text-inv-fg"
                  >
                    {tourStep + 1 < s.tour.length ? s.next : s.start}
                  </button>
                </div>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        s={s}
        lang={lang}
        items={cart}
        onRemove={(id) => saveCart(cart.filter((x) => x.id !== id))}
        onOrder={(o) => {
          setCartOpen(false);
          order(o);
          saveCart(cart.filter((x) => x.id !== o.id));
        }}
      />
      <CheckSheet open={checkOpen} onClose={() => setCheckOpen(false)} s={s} api={authFetch} />
      <AutoOrderSheet
        offer={autoOffer}
        onClose={() => setAutoOffer(null)}
        s={s}
        lang={lang}
        me={me}
        api={authFetch}
        country={country}
        onDone={(r) => {
          if (autoOffer) track("order", autoOffer, token);
          setMe((cur) => (cur ? { ...cur, usage: r.usage ?? cur.usage, email: r.email } : cur));
          setNotice(s.autoDone);
        }}
      />
      <AccountSheet
        open={accountOpen}
        onClose={() => {
          setAccountOpen(false);
          setAccountTab(undefined);
        }}
        initialTab={accountTab}
        s={s}
        lang={lang}
        me={me}
        api={authFetch}
        country={country}
        onUsage={(u) => setMe((cur) => (cur ? { ...cur, usage: u } : cur))}
        settings={settings}
        onSettings={updateSettings}
        onWatchesSeen={() => setDrops(0)}
      />
      <CountrySheet
        open={countryOpen}
        lang={lang}
        s={s}
        current={settings.country}
        ipCountry={config?.geo.country}
        onClose={() => setCountryOpen(false)}
        onPick={(c) => {
          updateSettings({ country: c });
          setCountryOpen(false);
        }}
      />
    </div>
  );
}

function ScopeBar({ s, scope, onChange }: { s: Strings; scope: Scope; onChange: (s: Scope) => void }) {
  const items: Scope[] = ["auto", "online", "local", "services"];
  return (
    <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label={s.scope}>
      {items.map((k) => (
        <button
          key={k}
          role="radio"
          aria-checked={scope === k}
          onClick={() => onChange(k)}
          className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
            scope === k ? "border-fg bg-inv-bg text-inv-fg" : "border-line text-fg-soft hover:bg-bg-soft"
          }`}
        >
          {s.scopes[k]}
        </button>
      ))}
      {scope === "local" && (
        <a
          href="https://mapofpi.com"
          target="_blank"
          rel="noopener noreferrer"
          className="ms-auto shrink-0 self-center text-[11px] text-fg-muted underline underline-offset-2 hover:text-fg"
          data-testid="mapofpi"
        >
          {s.mapOfPi} ↗
        </a>
      )}
    </div>
  );
}

function CountrySheet({
  open,
  lang,
  s,
  current,
  ipCountry,
  onClose,
  onPick,
}: {
  open: boolean;
  lang: Lang;
  s: Strings;
  current: string | null;
  ipCountry?: string;
  onClose: () => void;
  onPick: (c: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const valid = ALL_COUNTRIES.filter((c) => {
      const n = countryLabel(c, "en");
      return n !== c && !/^Unknown/i.test(n);
    });
    const rest = valid.filter((c) => !TOP_COUNTRIES.includes(c)).sort((a, b) => countryLabel(a, lang).localeCompare(countryLabel(b, lang), lang));
    const all = [...TOP_COUNTRIES, ...rest];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((c) => countryLabel(c, lang).toLowerCase().includes(needle) || countryLabel(c, "en").toLowerCase().includes(needle) || c.toLowerCase() === needle) : all;
  }, [q, lang]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <m.div
            role="dialog"
            aria-label={s.country}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-bg p-3 shadow-card sm:bottom-auto sm:top-[10dvh] sm:rounded-3xl"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-sm font-semibold">{s.country}</span>
              <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <label className="mb-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <Search className="size-4 text-fg-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={s.country} />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <button onClick={() => onPick(null)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm hover:bg-bg-soft">
                <Globe2 className="size-4" />
                <span className="flex-1">
                  {s.countryAuto}
                  {ipCountry ? ` · ${flag(ipCountry)} ${countryLabel(ipCountry, lang)}` : ""}
                </span>
                {current === null && <Check className="size-4" />}
              </button>
              {list.map((c) => (
                <button key={c} onClick={() => onPick(c)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm hover:bg-bg-soft">
                  <span aria-hidden>{flag(c)}</span>
                  <span className="flex-1">{countryLabel(c, lang)}</span>
                  {current === c && <Check className="size-4" />}
                </button>
              ))}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SignIn({
  s,
  busy,
  error,
  devLogin,
  sandbox,
  hint,
  onSignIn,
  onDevSignIn,
  onGuest,
}: {
  s: Strings;
  onGuest: () => void;
  busy: boolean;
  error: string;
  devLogin: boolean;
  sandbox: boolean;
  hint: string;
  onSignIn: () => void;
  onDevSignIn: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center py-10 text-center">
      <m.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
        <Logo size={56} />
      </m.div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{s.appName}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{s.tagline}</p>
      <div className="mt-8 w-full max-w-sm rounded-3xl border border-line bg-bg-soft p-5">
        <div className="text-base font-semibold">{s.signInTitle}</div>
        <p className="mt-1 text-sm text-fg-muted">{s.signInSub}</p>
        <m.button
          whileTap={{ scale: 0.97 }}
          disabled={busy}
          onClick={onSignIn}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <span className="text-base leading-none">π</span>}
          {busy ? s.signingIn : s.signInBtn}
        </m.button>
        {devLogin && (
          <button onClick={onDevSignIn} disabled={busy} className="mt-2 w-full rounded-2xl border border-line py-2.5 text-xs font-medium text-fg-soft hover:bg-bg">
            {s.devSignIn}
          </button>
        )}
        {(error || hint) && (
          <p className="mt-3 text-xs text-danger" dir="auto">
            {error || hint}
          </p>
        )}
        {sandbox && <p className="mt-3 text-[11px] text-fg-muted">Pi Sandbox · Testnet</p>}
      </div>
      <button onClick={onGuest} className="mt-4 text-[13.5px] font-medium text-accent underline-offset-4 hover:underline" data-testid="browse-guest">
        {s.browseGuest}
      </button>
      <section className="mt-10 w-full max-w-xl text-start" aria-labelledby="how-title" data-testid="how">
        <h2 id="how-title" className="mb-3 text-center text-sm font-semibold">
          {s.howTitle}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.how.map((x, i) => {
            const Icon = [Search, ShieldCheck, Wallet, MapPin][i] ?? Search;
            return (
              <m.div
                key={x.t}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                className="flex gap-3 rounded-2xl border border-line p-3.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-inv-bg text-inv-fg">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{x.t}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{x.d}</span>
                </span>
              </m.div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-[11px] text-fg-muted">
          <a href="/privacy" className="underline underline-offset-2 hover:text-fg">
            {s.privacy}
          </a>
          {" · "}
          <a href="/terms" className="underline underline-offset-2 hover:text-fg">
            {s.terms}
          </a>
          {" · "}
          <a href="/merchants" className="underline underline-offset-2 hover:text-fg">
            {s.forMerchants}
          </a>
        </p>
      </section>
    </div>
  );
}

function EmptyState({
  s,
  lang,
  needsKey,
  onPick,
  onCheck,
  country,
  forYou,
}: {
  s: Strings;
  lang: Lang;
  needsKey: boolean;
  onPick: (t: string) => void;
  onCheck: () => void;
  country?: string;
  forYou: string[];
}) {
  return (
    <div className="flex min-h-[calc(100dvh-16rem)] flex-col items-center justify-center py-10 text-center">
      <m.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
        <Logo size={56} />
      </m.div>
      <m.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
        {s.emptyTitle}
      </m.h1>
      <m.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
        {s.emptySub}
      </m.p>
      {needsKey && <p className="mt-4 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-danger">{s.needKey}</p>}
      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {s.suggestions.map((q, i) => (
          <m.button
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
          </m.button>
        ))}
      </div>
      {forYou.length > 0 && (
        <div className="mt-6 w-full max-w-xl text-start" data-testid="for-you">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">✨ {s.forYou}</div>
          <div className="flex flex-wrap gap-1.5">
            {forYou.map((q) => (
              <button key={q} onClick={() => onPick(q)} className="rounded-full border border-line px-3 py-1 text-[12px] text-fg-soft hover:bg-bg-soft" dir="auto">
                {s.searchAgain(q)}
              </button>
            ))}
          </div>
        </div>
      )}
      <button onClick={onCheck} className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[13px] font-medium hover:bg-bg-soft" data-testid="check-open">
        <ShieldCheck className="size-4" /> {s.checkStore}
      </button>
      <Deals s={s} lang={lang} country={country} />
    </div>
  );
}
