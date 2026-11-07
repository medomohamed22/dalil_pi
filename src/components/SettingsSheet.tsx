"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";

/**
 * Settings = the spending mandate only. The AI model, its key, the market
 * (US) and the language (English) are fixed by the server.
 */
export default function SettingsSheet({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setSaved(false);
    }
  }, [open, settings]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  async function save() {
    await onSave(draft);
    setSaved(true);
    setTimeout(onClose, 450);
  }

  const presets = [0, 100, 250, 500, 1000];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Settings"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:bottom-auto sm:end-0 sm:start-auto sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-s sm:border-t-0"
            initial={{ y: "100%", x: 0 }}
            animate={{ y: 0, x: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/90 px-5 py-4 backdrop-blur">
              <h2 className="text-base font-semibold">Spending limit</h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-bg-soft" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 px-5 pb-6">
              <div className="flex items-start gap-3 rounded-2xl bg-bg-soft p-3.5 text-[12.5px] leading-snug text-fg-soft">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <p>
                  Your mandate for Dalil. It&apos;s enforced in server code at the moment money moves — a payment above it is refused even if the
                  AI asks for it.
                </p>
              </div>

              <div>
                <label htmlFor="max-spend" className="mb-1.5 block text-xs font-medium text-fg-muted">
                  Max total per purchase (USD)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-muted">$</span>
                  <input
                    id="max-spend"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    className="w-full rounded-xl border border-line bg-bg py-2.5 pl-7 pr-3 text-sm tabular-nums outline-none transition-colors focus:border-fg"
                    placeholder="No limit"
                    value={draft.maxSpend || ""}
                    onChange={(e) => set("maxSpend", Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {presets.map((v) => (
                    <button
                      key={v}
                      onClick={() => set("maxSpend", v)}
                      className={`rounded-full border px-3 py-1 text-xs tabular-nums transition-colors ${
                        draft.maxSpend === v ? "border-fg bg-inv-bg text-inv-fg" : "border-line hover:bg-bg-soft"
                      }`}
                    >
                      {v ? `$${v.toLocaleString("en-US")}` : "No limit"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3 py-3">
                <span>
                  <span className="block text-sm">Verified stores only</span>
                  <span className="block text-[11.5px] text-fg-muted">Major retailers and official brand stores</span>
                </span>
                <button
                  role="switch"
                  aria-checked={draft.verifiedOnly}
                  aria-label="verified-only"
                  onClick={() => set("verifiedOnly", !draft.verifiedOnly)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${draft.verifiedOnly ? "bg-inv-bg" : "bg-line-strong"}`}
                >
                  <motion.span
                    layout
                    className="absolute top-0.5 size-5 rounded-full bg-bg shadow"
                    style={{ insetInlineStart: draft.verifiedOnly ? "1.375rem" : "0.125rem" }}
                  />
                </button>
              </label>
            </div>

            <div className="sticky bottom-0 border-t border-line bg-bg/90 p-4 backdrop-blur">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={save}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-inv-bg py-3 text-sm font-semibold text-inv-fg"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {saved ? (
                    <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2">
                      <Check className="size-4" /> Saved
                    </motion.span>
                  ) : (
                    <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      Save
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
