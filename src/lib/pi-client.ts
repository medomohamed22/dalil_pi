"use client";

/**
 * Pi SDK in the browser (https://github.com/pi-apps/pi-platform-docs).
 * The SDK script is loaded once; `sandbox: true` runs against the Pi Testnet
 * sandbox (NEXT_PUBLIC_PI_SANDBOX=true). Authentication only works inside the
 * Pi Browser or the Pi Sandbox (sandbox.minepi.com).
 */
interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username?: string };
}
export interface PiPaymentDTO {
  identifier: string;
  amount: number;
  transaction: null | { txid: string };
}
interface PiPaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: PiPaymentDTO) => void;
}
interface PiSDK {
  init(cfg: { version: string; sandbox?: boolean }): void;
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: PiPaymentDTO) => void): Promise<PiAuthResult>;
  createPayment(data: { amount: number; memo: string; metadata: Record<string, unknown> }, callbacks: PiPaymentCallbacks): void;
}

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}

const SDK_URL = "https://sdk.minepi.com/pi-sdk.js";
let ready: Promise<PiSDK | null> | null = null;

export const PI_SANDBOX = process.env.NEXT_PUBLIC_PI_SANDBOX === "true";

export function loadPi(): Promise<PiSDK | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  ready ??= new Promise<PiSDK | null>((resolve) => {
    const done = () => {
      if (!window.Pi) return resolve(null);
      try {
        window.Pi.init({ version: "2.0", sandbox: PI_SANDBOX });
        resolve(window.Pi);
      } catch {
        resolve(null);
      }
    };
    if (window.Pi) return done();
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = done;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return ready;
}

/** Best-effort check: the Pi Browser identifies itself in the user agent. */
export function inPiBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /PiBrowser/i.test(navigator.userAgent) || (PI_SANDBOX && window.self !== window.top);
}

/** Opens the Pi auth dialog and resolves with the access token (verified later by our server). */
export async function piAuthenticate(timeoutMs = 60_000): Promise<string> {
  const Pi = await loadPi();
  if (!Pi) throw new Error("PI_SDK_UNAVAILABLE");
  const auth = Pi.authenticate(["username"], () => {
    /* Plan payments arrive in a later phase; product payments go to the stores directly. */
  });
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("PI_AUTH_TIMEOUT")), timeoutMs));
  const res = await Promise.race([auth, timeout]);
  if (!res?.accessToken) throw new Error("PI_AUTH_FAILED");
  return res.accessToken;
}

type Post = (url: string, body: unknown) => Promise<Response>;

async function postOk<T>(post: Post, url: string, body: unknown): Promise<T> {
  const res = await post(url, body);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { code: j.code });
  return j;
}

/**
 * Pays for a plan with Pi (user → app). The server approves only after it
 * checked the amount against its signed quote, and activates the 30-day pack
 * when it completes the payment. Resolves with the server's reply to /complete.
 */
export async function piPay<T>(opts: { amount: number; memo: string; metadata: Record<string, unknown>; post: Post }): Promise<T> {
  const Pi = await loadPi();
  if (!Pi) throw Object.assign(new Error("PI_SDK_UNAVAILABLE"), { code: "PI_SDK_UNAVAILABLE" });
  // Payments need the "payments" scope in this page session. A payment left
  // unfinished earlier blocks new ones, so settle it first.
  let stuck: PiPaymentDTO | null = null;
  await Pi.authenticate(["username", "payments"], (p) => {
    stuck = p;
  });
  if (stuck) {
    await postOk(opts.post, "/api/payments/incomplete", { paymentId: (stuck as PiPaymentDTO).identifier }).catch(() => {});
  }
  return new Promise<T>((resolve, reject) => {
    Pi.createPayment(
      { amount: opts.amount, memo: opts.memo, metadata: opts.metadata },
      {
        onReadyForServerApproval: (paymentId) => {
          postOk(opts.post, "/api/payments/approve", { paymentId }).catch(reject);
        },
        onReadyForServerCompletion: (paymentId, txid) => {
          postOk<T>(opts.post, "/api/payments/complete", { paymentId, txid }).then(resolve, reject);
        },
        onCancel: () => reject(Object.assign(new Error("PAYMENT_CANCELLED"), { code: "PAYMENT_CANCELLED" })),
        onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      },
    );
  });
}
