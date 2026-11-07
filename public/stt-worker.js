// Dalil Pi — on-device speech-to-text (free, no server).
// Runs OpenAI Whisper (base, quantized) in the browser with transformers.js + ONNX Runtime Web.
// The model (~77 MB) downloads once from the Hugging Face CDN and is then cached by the browser.
// Audio never leaves the device.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const MODEL = "onnx-community/whisper-base";
env.allowLocalModels = false;
env.useBrowserCache = true;

let asr = null;
let loading = null;

function load() {
  if (asr) return Promise.resolve(asr);
  loading ??= pipeline("automatic-speech-recognition", MODEL, {
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
    device: "wasm",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) self.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
    },
  }).then((m) => {
    asr = m;
    self.postMessage({ type: "ready" });
    return m;
  });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, audio, lang } = e.data || {};
  try {
    if (type === "load") {
      await load();
      return;
    }
    if (type === "transcribe") {
      const model = await load();
      const out = await model(audio, {
        language: lang === "ar" ? "arabic" : lang === "en" ? "english" : undefined,
        task: "transcribe",
        chunk_length_s: 30,
      });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text || "").trim();
      self.postMessage({ id, type: "result", text });
    }
  } catch (err) {
    loading = null;
    self.postMessage({ id, type: "error", message: String((err && err.message) || err) });
  }
};
