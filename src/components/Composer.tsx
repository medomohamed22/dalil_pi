"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ImageIcon, Link2, Loader2, Mic, Plus, ScanBarcode, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Strings } from "@/lib/i18n";
import type { Lang, LinkPreview } from "@/lib/types";
import ScannerSheet from "./Scanner";

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Downscale images client-side so they stay small in IndexedDB and in requests. */
async function compressImage(file: File, max = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export interface ComposerPayload {
  text: string;
  images: string[];
  links: LinkPreview[];
}

/* ---- Voice input (Web Speech API) ---- */
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
function speechCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function Composer({
  s,
  lang,
  busy,
  onSend,
  onStop,
  prefill,
}: {
  s: Strings;
  lang: Lang;
  busy: boolean;
  onSend: (p: ComposerPayload) => void;
  onStop: () => void;
  prefill?: { text: string; n: number };
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, LinkPreview | "loading">>({});
  const [drag, setDrag] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const [scan, setScan] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const recRef = useRef<Rec | null>(null);
  const heardRef = useRef("");
  const ar = lang === "ar";

  useEffect(() => setVoiceOk(!!speechCtor()), []);

  useEffect(() => {
    if (prefill) {
      setText(prefill.text);
      taRef.current?.focus();
    }
  }, [prefill]);

  // Auto-grow
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  // Fetch link previews for pasted URLs (debounced)
  const urls = Array.from(new Set(text.match(URL_RE) ?? [])).slice(0, 3);
  const urlsKey = urls.join(" ");
  useEffect(() => {
    const id = setTimeout(() => {
      for (const u of urlsKey ? urlsKey.split(" ") : []) {
        if (previews[u]) continue;
        setPreviews((p) => ({ ...p, [u]: "loading" }));
        fetch(`/api/preview?url=${encodeURIComponent(u)}`)
          .then((r) => r.json())
          .then((pv: LinkPreview) => setPreviews((p) => ({ ...p, [u]: { ...pv, url: pv.url ?? u } })))
          .catch(() => setPreviews((p) => ({ ...p, [u]: { url: u } })));
      }
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 4 - images.length);
    const out = await Promise.all(list.map((f) => compressImage(f)));
    setImages((x) => [...x, ...out].slice(0, 4));
  }

  function startVoice() {
    const Ctor = speechCtor();
    if (!Ctor || busy) return;
    setVoiceErr("");
    const rec = new Ctor();
    rec.lang = ar ? "ar-EG" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    heardRef.current = "";
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      heardRef.current = (finalText || interim).trim();
      setText(heardRef.current);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setVoiceErr(ar ? "اسمح للموقع يستخدم المايك من إعدادات المتصفح" : "Allow microphone access in your browser settings");
      else if (e.error !== "aborted" && e.error !== "no-speech") setVoiceErr(ar ? "مقدرتش أسمعك، جرّب تاني" : "Couldn't hear you — try again");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      // Hands-free: send what was heard.
      const heard = heardRef.current;
      if (heard) {
        onSend({ text: heard, images, links: [] });
        setText("");
        setImages([]);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      navigator.vibrate?.(20);
    } catch {
      setListening(false);
    }
  }

  function stopVoice() {
    recRef.current?.stop();
  }

  useEffect(() => () => recRef.current?.abort(), []);

  const onCode = useCallback(
    (code: string) => {
      setScan(false);
      onSend({
        text: ar ? `باركود: ${code} — لاقيلي أرخص سعر للمنتج ده` : `Barcode: ${code} — find me the best price for this product`,
        images: [],
        links: [],
      });
    },
    [ar, onSend],
  );

  function send() {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed && !images.length) return;
    const links = urls
      .map((u) => previews[u])
      .map((p, i) => (p && p !== "loading" ? p : { url: urls[i] }));
    onSend({ text: trimmed, images, links });
    setText("");
    setImages([]);
    setPreviews({});
  }

  const canSend = !!(text.trim() || images.length);

  return (
    <div
      className={`relative rounded-[1.6rem] border bg-bg shadow-card transition-colors ${drag ? "border-fg" : "border-line"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <AnimatePresence>
        {(images.length > 0 || urls.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="no-scrollbar flex gap-2 overflow-x-auto px-3 pt-3"
          >
            {images.map((src, i) => (
              <motion.div key={i} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-16 rounded-xl border border-line object-cover" />
                <button
                  onClick={() => setImages((x) => x.filter((_, j) => j !== i))}
                  className="absolute -end-1.5 -top-1.5 rounded-full bg-inv-bg p-0.5 text-inv-fg"
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </motion.div>
            ))}
            {urls.map((u) => {
              const p = previews[u];
              const pv = p && p !== "loading" ? p : undefined;
              let host = u;
              try {
                host = new URL(u).hostname.replace(/^www\./, "");
              } catch {}
              return (
                <motion.div
                  key={u}
                  layout
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex h-16 w-60 shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-line bg-bg-soft pe-2"
                >
                  {pv?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pv.image} alt="" referrerPolicy="no-referrer" className="h-full w-16 bg-white object-contain" />
                  ) : (
                    <div className="flex h-full w-12 items-center justify-center text-fg-muted">
                      {p === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-fg-muted">{host}</div>
                    <div className="line-clamp-2 text-xs font-medium leading-tight">{pv?.title ?? u}</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-1.5 p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="relative mb-0.5 shrink-0">
          <motion.button
            onClick={() => setMenu((m) => !m)}
            animate={{ rotate: menu ? 45 : 0 }}
            className="rounded-full p-2.5 text-fg-muted transition-colors hover:bg-bg-soft hover:text-fg"
            aria-label={s.attach}
            aria-expanded={menu}
            title={s.attach}
          >
            <Plus className="size-5" strokeWidth={1.75} />
          </motion.button>
          <AnimatePresence>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                  className="absolute bottom-full start-0 z-20 mb-2 w-52 overflow-hidden rounded-2xl border border-line bg-bg p-1 shadow-card"
                >
                  {[
                    { icon: ImageIcon, label: ar ? "صورة منتج" : "Product photo", sub: ar ? "من المعرض أو الكاميرا" : "From gallery or camera", act: () => fileRef.current?.click() },
                    { icon: ScanBarcode, label: ar ? "مسح باركود" : "Scan barcode", sub: ar ? "في المحل؟ قارن أونلاين" : "In a store? Compare online", act: () => setScan(true) },
                  ].map((it) => (
                    <button
                      key={it.label}
                      onClick={() => {
                        setMenu(false);
                        it.act();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start hover:bg-bg-soft"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-soft">
                        <it.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{it.label}</span>
                        <span className="block truncate text-[11px] text-fg-muted">{it.sub}</span>
                      </span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        <textarea
          ref={taRef}
          rows={1}
          dir="auto"
          value={text}
          placeholder={listening ? (ar ? "سامعك… اتكلم" : "Listening… speak now") : s.placeholder}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[200px] min-h-[2.75rem] flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 outline-none placeholder:text-fg-muted"
        />
        <AnimatePresence mode="wait" initial={false}>
          {busy ? (
            <motion.button
              key="stop"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              onClick={onStop}
              className="mb-0.5 shrink-0 rounded-full bg-inv-bg p-2.5 text-inv-fg"
              aria-label={s.stop}
            >
              <Square className="size-4 fill-current" />
            </motion.button>
          ) : listening ? (
            <motion.button
              key="listening"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              onClick={stopVoice}
              className="relative mb-0.5 flex h-10 shrink-0 items-center gap-[3px] rounded-full bg-inv-bg px-3 text-inv-fg"
              aria-label={ar ? "إيقاف التسجيل" : "Stop listening"}
            >
              <span className="voice-ring absolute inset-0 rounded-full" />
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="voice-bar w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </motion.button>
          ) : !canSend && voiceOk ? (
            <motion.button
              key="mic"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={startVoice}
              className="mb-0.5 shrink-0 rounded-full bg-inv-bg p-2.5 text-inv-fg"
              aria-label={ar ? "اتكلم" : "Speak"}
              title={ar ? "اطلب بصوتك" : "Ask by voice"}
            >
              <Mic className="size-4" strokeWidth={2.25} />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={send}
              disabled={!canSend}
              className="mb-0.5 shrink-0 rounded-full bg-inv-bg p-2.5 text-inv-fg transition-opacity disabled:opacity-25"
              aria-label={s.send}
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {voiceErr && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-2 text-xs text-danger"
            onClick={() => setVoiceErr("")}
          >
            {voiceErr}
          </motion.p>
        )}
      </AnimatePresence>
      <ScannerSheet open={scan} lang={lang} onClose={() => setScan(false)} onCode={onCode} />
    </div>
  );
}
