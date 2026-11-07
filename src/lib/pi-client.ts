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
interface PiSDK {
  init(cfg: { version: string; sandbox?: boolean }): void;
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: unknown) => void): Promise<PiAuthResult>;
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
