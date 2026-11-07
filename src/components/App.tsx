"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Check, Globe2, Loader2, LogOut, Menu, Moon, PanelLeft, Plus, Search, Sun, Trash2, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, delKV, getKV, loadSettings, requestPersistence, saveSettings, setKV, uid } from "@/lib/db";
import { countryLabel, flag, t, type Strings } from "@/lib/i18n";
import { inPiBrowser, loadPi, PI_SANDBOX, piAuthenticate } from "@/lib/pi-client";
import { DEFAULT_SETTINGS, type AgentEvent, type Block, type ChatMessage, type Lang, type Me, type Offer, type Scope, type Settings, type Step, type Usage, type WireMessage } from "@/lib/types";
import { AccountSheet, AutoOrderSheet } from "./Account";
import Composer, { type ComposerPayload } from "./Composer";
import Logo from "./Logo";
import MessageView from "./MessageView";

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
    const at = e.block.type === "products" || e.block.type === "browser" ? next.findIndex((b) => b.type === e.block.type) : -1;
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
  const lang: Lang = settings.lang;
  const s = t(lang);
  const ar = lang === "ar";

  /* ---------- boot ---------- */
  useEffect(() => {
    requestPersistence();
    loadSettings().then(async (st) => {
      setSettings(st);
      const saved = await getKV<string>(SESSION_KEY);
      if (saved) setToken(saved);
      setReady(true);
    });
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: Config) => setConfig(c))
      .catch(() => {});
    setDark(document.documentElement.classList.contains("dark"));
    void loadPi();
  }, []);

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
            settings: { lang, country: settings.country, scope: settings.scope, coords: settings.coords ?? null },
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
          assistant = { ...assistant, blocks: applyEvent(assistant.blocks, { type: "error", message: e.message ?? String(err), code: e.code }) };
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

  /* ---------- UI pieces ---------- */
  const usage = me?.usage;
  const left = usage ? Math.max(0, usage.searchLimit - usage.searchesUsed) : null;
  const ordersLeft = usage ? Math.max(0, usage.orderLimit - usage.ordersUsed) : null;

  /**
   * "Order" on a product card: open the product page in the store right away
   * (inside the click, so the browser doesn't block it), then save and count
   * the order on our server. The user pays the store directly.
   */
  const [autoOffer, setAutoOffer] = useState<Offer | null>(null);
  const order = (o: Offer) => {
    if (!o.url) return;
    // Stores whose checkout takes Pi: confirm what we send, then Dalil Pi places the order there.
    if (o.checkout === "woo_pi") {
      setNotice("");
      setAutoOffer(o);
      return;
    }
    window.open(o.url, "_blank", "noopener,noreferrer");
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
      <div className="space-y-1 border-t border-line p-2 text-sm">
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

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/30 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 start-0 z-40 w-[82%] max-w-[300px] border-e border-line bg-bg-soft md:hidden"
              initial={{ x: ar ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: ar ? "100%" : "-100%" }}
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
          <button className="hidden rounded-lg p-2 text-fg-muted hover:bg-bg-soft hover:text-fg md:block" onClick={() => setDesktopSidebar((v) => !v)} aria-label="Toggle sidebar">
            <PanelLeft className="size-[18px] rtl:-scale-x-100" />
          </button>
          <span className="whitespace-nowrap text-[15px] font-semibold md:hidden">{s.appName}</span>
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-3xl px-4 pb-6">
            {!ready ? null : !token ? (
              <SignIn
                s={s}
                busy={authBusy}
                error={authError}
                devLogin={!!config?.devLogin}
                sandbox={PI_SANDBOX}
                hint={!inPiBrowser() && !config?.devLogin ? s.openInPiBrowser : ""}
                onSignIn={signIn}
                onDevSignIn={devSignIn}
              />
            ) : messages.length === 0 ? (
              <EmptyState s={s} needsKey={config ? !config.ai : false} onPick={(text) => setPrefill({ text, n: Date.now() })} />
            ) : (
              <div className="space-y-7 pt-4">
                {messages.map((m) => (
                  <div key={m.id} id={`msg-${m.id}`}>
                    <MessageView msg={m} live={live?.id === m.id} s={s} lang={lang} city={config?.geo.city} onOrder={order} ordersLeft={ordersLeft} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {token && (
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
              <Composer s={s} lang={lang} busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} prefill={prefill} />
              {notice && (
                <p className={`mt-2 text-center text-[11px] ${notice === s.autoDone ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-danger"}`} dir="auto" role="status">
                  {notice}
                </p>
              )}
              <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-fg-muted">
                {usage && left != null && (
                  <span className={`rounded-full px-2 py-0.5 tabular-nums ${left === 0 ? "bg-danger/10 text-danger" : "bg-bg-soft"}`} data-testid="usage">
                    {s.searchesLeft(left, usage.searchLimit)}
                  </span>
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
      </main>

      <AutoOrderSheet
        offer={autoOffer}
        onClose={() => setAutoOffer(null)}
        s={s}
        lang={lang}
        me={me}
        api={authFetch}
        country={country}
        onDone={(r) => {
          setMe((cur) => (cur ? { ...cur, usage: r.usage ?? cur.usage, email: r.email } : cur));
          setNotice(s.autoDone);
        }}
      />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} s={s} lang={lang} me={me} api={authFetch} country={country} onUsage={(u) => setMe((cur) => (cur ? { ...cur, usage: u } : cur))} />
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
          <motion.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={s.country}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
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
          </motion.div>
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
}: {
  s: Strings;
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
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
        <Logo size={56} />
      </motion.div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">{s.appName}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{s.tagline}</p>
      <div className="mt-8 w-full max-w-sm rounded-3xl border border-line bg-bg-soft p-5">
        <div className="text-base font-semibold">{s.signInTitle}</div>
        <p className="mt-1 text-sm text-fg-muted">{s.signInSub}</p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={busy}
          onClick={onSignIn}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <span className="text-base leading-none">π</span>}
          {busy ? s.signingIn : s.signInBtn}
        </motion.button>
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
    </div>
  );
}

function EmptyState({ s, needsKey, onPick }: { s: Strings; needsKey: boolean; onPick: (t: string) => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-16rem)] flex-col items-center justify-center py-10 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
        <Logo size={56} />
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
        {s.emptyTitle}
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">
        {s.emptySub}
      </motion.p>
      {needsKey && <p className="mt-4 rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-danger">{s.needKey}</p>}
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
