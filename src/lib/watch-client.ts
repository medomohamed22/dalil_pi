"use client";

import { getKV, setKV } from "./db";
import type { Market, Offer, Watch, WatchMode } from "./types";

/** Random per-browser id; the server only stores its SHA-256. */
export async function deviceId(): Promise<string> {
  let id = await getKV<string>("deviceId");
  if (!id) {
    const b = crypto.getRandomValues(new Uint8Array(24));
    id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    await setKV("deviceId", id);
  }
  return id;
}

export class WatchApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", "x-device-id": await deviceId() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new WatchApiError(j.error ?? `HTTP ${res.status}`, j.code, res.status);
  return j as T;
}

export interface WatchList {
  watches: Watch[];
  vaultConnected: boolean;
  persistent?: boolean;
  push?: boolean;
}

export const watchApi = {
  list: () => api<WatchList>("/api/watches"),
  sync: () => api<WatchList>("/api/watches/sync", { method: "POST", body: {} }),
  create: (b: { offer: Offer; targetPrice: number; mode: WatchMode; maxSpend: number; market: Market; demo: boolean }) =>
    api<{ watch: Watch }>("/api/watches", { method: "POST", body: b }),
  action: (id: string, action: "simulate" | "check" | "cancel" | "capture" | "reactivate" | "purchased", price?: number) =>
    api<{ watch: Watch }>(`/api/watches/${id}`, { method: "POST", body: { action, price } }),
  remove: (id: string) => api<{ ok: true }>(`/api/watches/${id}`, { method: "DELETE" }),
  vaultSetup: () => api<{ id: string; approveUrl: string }>("/api/paypal/vault-setup", { method: "POST", body: {} }),
  vaultConfirm: (setupTokenId: string) =>
    api<{ connected: boolean }>("/api/paypal/vault-confirm", { method: "POST", body: { setupTokenId } }),
  vaultDisconnect: () => api<{ connected: boolean }>("/api/paypal/vault-confirm", { method: "DELETE" }),
};

/* ---------------- Web Push ---------------- */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/**
 * Ask for notification permission and, when the server has VAPID keys,
 * subscribe to Web Push so alerts arrive even with the app closed.
 * Returns "push" | "local" | "denied".
 */
export async function enableNotifications(): Promise<"push" | "local" | "denied"> {
  if (!("Notification" in window)) return "denied";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return "denied";
  try {
    const cfg = (await (await fetch("/api/push")).json()) as { configured: boolean; publicKey: string | null };
    const reg = await registerServiceWorker();
    if (!cfg.configured || !cfg.publicKey || !reg || !("pushManager" in reg)) return "local";
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) as BufferSource,
      }));
    await api("/api/push", { method: "PUT", body: sub.toJSON() });
    return "push";
  } catch {
    return "local";
  }
}

/** Fallback notification while the app is open (no push configured). */
export async function localNotify(title: string, body: string, url?: string, image?: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icon.svg", badge: "/icon.svg", data: { url }, ...(image ? { image } : {}) } as NotificationOptions);
    else new Notification(title, { body, icon: "/icon.svg" });
  } catch {
    /* ignore */
  }
}
