"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ImageIcon, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/types";

/**
 * Barcode scanner: native BarcodeDetector when available (Android Chrome),
 * otherwise ZXing (lazy-loaded). Also decodes a barcode from a photo.
 */
type Detector = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<Array<{ rawValue: string }>> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

async function nativeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector & object }).BarcodeDetector;
  if (!BD) return null;
  try {
    const supported: string[] = await (BD as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats?.() ?? FORMATS;
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new BD({ formats }) : null;
  } catch {
    return null;
  }
}

const valid = (v: string) => /^\d{8,14}$/.test(v.trim());
/** UPC-A (12 digits) is EAN-13 with a leading 0 — use one form everywhere. */
const norm = (v: string) => (v.trim().length === 12 ? "0" + v.trim() : v.trim());

export async function decodeImageFile(file: File): Promise<string | null> {
  const det = await nativeDetector();
  if (det) {
    try {
      const bmp = await createImageBitmap(file);
      const r = await det.detect(bmp);
      const hit = r.find((x) => valid(x.rawValue));
      if (hit) return norm(hit.rawValue);
    } catch {
      /* fall through to ZXing */
    }
  }
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const url = URL.createObjectURL(file);
  try {
    const res = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    const v = res.getText();
    return valid(v) ? norm(v) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ScannerSheet({
  open,
  lang,
  onClose,
  onCode,
}: {
  open: boolean;
  lang: Lang;
  onClose: () => void;
  onCode: (code: string) => void;
}) {
  const ar = lang === "ar";
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "found" | "nocam" | "decoding" | "notfound">("starting");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let zxingStop: (() => void) | undefined;
    setState("starting");
    setCode("");

    const found = (v: string) => {
      if (!alive) return;
      alive = false;
      setCode(v);
      setState("found");
      navigator.vibrate?.(60);
      setTimeout(() => onCode(v), 900);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        if (alive) setState("nocam");
        return;
      }
      const video = videoRef.current;
      if (!alive || !video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setState("scanning");
      const det = await nativeDetector();
      if (det) {
        timer = setInterval(async () => {
          if (!alive || video.readyState < 2) return;
          try {
            const r = await det.detect(video);
            const hit = r.find((x) => valid(x.rawValue));
            if (hit) found(norm(hit.rawValue));
          } catch {
            /* keep scanning */
          }
        }, 220);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (res) => {
          const v = res?.getText();
          if (v && valid(v)) found(norm(v));
        });
        zxingStop = () => controls.stop();
      }
    })();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode]);

  async function fromPhoto(file: File) {
    setState("decoding");
    const v = await decodeImageFile(file);
    if (v) {
      setCode(v);
      setState("found");
      navigator.vibrate?.(60);
      setTimeout(() => onCode(v), 900);
    } else setState("notfound");
  }

  const hint =
    state === "nocam"
      ? ar ? "مفيش كاميرا متاحة — ارفع صورة للباركود" : "No camera available — upload a photo of the barcode"
      : state === "notfound"
        ? ar ? "ملقتش باركود في الصورة، جرّب صورة أوضح" : "No barcode found in that photo — try a sharper one"
        : state === "decoding"
          ? ar ? "بقرا الباركود…" : "Reading the barcode…"
          : ar ? "وجّه الكاميرا على الباركود" : "Point the camera at a barcode";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label={ar ? "مسح باركود" : "Scan barcode"}
            className="w-full max-w-md overflow-hidden rounded-t-3xl bg-bg sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[15px] font-semibold">{ar ? "مسح باركود" : "Scan a barcode"}</div>
                <div className="text-xs text-fg-muted">{ar ? "في المحل؟ اعرف أرخص سعر أونلاين فورًا" : "In a store? See the best price online instantly"}</div>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-fg-muted hover:bg-bg-soft hover:text-fg" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>

            <div className="relative mx-4 aspect-[4/3] overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
              {/* Viewfinder */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[42%] w-[78%]">
                  {["start-0 top-0 border-s-2 border-t-2 rounded-ss-xl", "end-0 top-0 border-e-2 border-t-2 rounded-se-xl", "start-0 bottom-0 border-s-2 border-b-2 rounded-es-xl", "end-0 bottom-0 border-e-2 border-b-2 rounded-ee-xl"].map((c) => (
                    <span key={c} className={`absolute size-6 border-white ${c}`} />
                  ))}
                  {state === "scanning" && <span className="scan-laser absolute inset-x-2 h-0.5 rounded-full bg-white/90 shadow-[0_0_12px_2px_rgba(255,255,255,0.6)]" />}
                </div>
              </div>
              <AnimatePresence>
                {state === "found" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white"
                  >
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 14, stiffness: 300 }}
                      className="flex size-12 items-center justify-center rounded-full bg-white text-black"
                    >
                      <Check className="size-6" strokeWidth={3} />
                    </motion.span>
                    <span className="font-mono text-lg tracking-widest" dir="ltr">{code}</span>
                  </motion.div>
                )}
                {(state === "starting" || state === "decoding") && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center text-white/80">
                    <Loader2 className="size-6 animate-spin" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-3 p-4">
              <p className={`text-center text-sm ${state === "notfound" ? "text-danger" : "text-fg-soft"}`}>{hint}</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) fromPhoto(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm font-medium transition-colors hover:bg-bg-soft"
              >
                <ImageIcon className="size-4" />
                {ar ? "أو ارفع صورة للباركود" : "Or upload a barcode photo"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
