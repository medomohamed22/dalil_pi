"use client";

/**
 * Free, on-device voice typing.
 * - Records the microphone as 16 kHz mono PCM with the Web Audio API (works in
 *   in-app browsers such as the Pi Browser, where the Web Speech API doesn't).
 * - Transcribes with Whisper running in a Web Worker (public/stt-worker.js).
 */

const RATE = 16000;
const MAX_SECONDS = 30;

export function localSttSupported(): boolean {
  if (typeof window === "undefined") return false;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return !!(typeof navigator.mediaDevices?.getUserMedia === "function" && AC && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined");
}

/* ---------------- worker ---------------- */

type Pending = { resolve: (t: string) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let progressCb: ((pct: number) => void) | null = null;
const files = new Map<string, { loaded: number; total: number }>();
let ready = false;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker("/stt-worker.js", { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { id?: number; type: string; text?: string; message?: string; file?: string; loaded?: number; total?: number };
    if (m.type === "progress" && m.file) {
      files.set(m.file, { loaded: m.loaded ?? 0, total: m.total ?? 0 });
      let l = 0;
      let t = 0;
      for (const f of files.values()) {
        l += f.loaded;
        t += f.total;
      }
      if (t) progressCb?.(Math.min(99, Math.round((l / t) * 100)));
    } else if (m.type === "ready") {
      ready = true;
      progressCb?.(100);
    } else if (m.id != null) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.type === "result") p.resolve(m.text ?? "");
      else p.reject(new Error(m.message || "Transcription failed"));
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "Voice model failed to load"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function sttModelReady(): boolean {
  return ready;
}

/** Start downloading the model early (e.g. when the user first taps the mic). */
export function preloadStt(onProgress?: (pct: number) => void) {
  if (onProgress) progressCb = onProgress;
  getWorker().postMessage({ type: "load" });
}

export function transcribe(audio: Float32Array, lang: "ar" | "en", onProgress?: (pct: number) => void): Promise<string> {
  if (onProgress) progressCb = onProgress;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type: "transcribe", audio, lang }, [audio.buffer]);
  });
}

/* ---------------- recorder ---------------- */

export interface Recording {
  /** Stop and get the audio (16 kHz mono). */
  stop: () => Promise<Float32Array>;
  /** Cancel without keeping audio. */
  cancel: () => void;
  /** 0..1 input level, for a live meter. */
  level: () => number;
}

/**
 * Records until stop() — or automatically after `silenceMs` of silence once
 * speech was heard, or after 30 s (onAutoStop is then called).
 */
export async function startRecording(opts: { onAutoStop?: () => void; silenceMs?: number } = {}): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext;
  try {
    ctx = new AC({ sampleRate: RATE });
  } catch {
    ctx = new AC(); // some browsers refuse a custom rate — resample later
  }
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let lastLevel = 0;
  let heard = false;
  let quietSince = 0;
  let done = false;
  const silenceMs = opts.silenceMs ?? 1600;
  const startedAt = performance.now();

  proc.onaudioprocess = (ev) => {
    if (done) return;
    const data = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    lastLevel = Math.min(1, rms * 8);
    const now = performance.now();
    if (rms > 0.02) {
      heard = true;
      quietSince = 0;
    } else if (heard) {
      quietSince ||= now;
      if (now - quietSince > silenceMs) opts.onAutoStop?.();
    }
    if (now - startedAt > MAX_SECONDS * 1000) opts.onAutoStop?.();
  };
  src.connect(proc);
  proc.connect(ctx.destination);

  const cleanup = () => {
    done = true;
    try {
      proc.disconnect();
      src.disconnect();
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  };

  return {
    level: () => lastLevel,
    cancel: cleanup,
    stop: async () => {
      const rate = ctx.sampleRate;
      cleanup();
      const len = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(len);
      let o = 0;
      for (const c of chunks) {
        all.set(c, o);
        o += c.length;
      }
      return rate === RATE ? all : resample(all, rate, RATE);
    },
  };
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (x - i0);
  }
  return out;
}
