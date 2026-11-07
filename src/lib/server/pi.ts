import "server-only";
import { fetchWithTimeout } from "./net";

/**
 * Pi Platform API (server side). Docs: https://github.com/pi-apps/pi-platform-docs
 *   - GET  /v2/me                       (user access token)  → who the user is
 *   - GET  /v2/payments/{id}            (Server API Key)     → read a plan payment
 *   - POST /v2/payments/{id}/approve    (Server API Key)     → approve it after checking the quote
 *   - POST /v2/payments/{id}/complete   (Server API Key)     → complete it with the blockchain txid
 *   - POST /v2/payments/{id}/cancel     (Server API Key)     → cancel a stuck one
 * The Server API Key lives only in the Vercel environment (PI_API_KEY).
 */
// PI_API_BASE_URL exists only so local tests can point at a mock; leave it unset in Vercel.
const PI_API = process.env.VERCEL ? "https://api.minepi.com/v2" : process.env.PI_API_BASE_URL || "https://api.minepi.com/v2";

export type PiNetwork = "testnet" | "mainnet";

export function piNetwork(): PiNetwork {
  return process.env.PI_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export function piConfigured(): boolean {
  return !!process.env.PI_API_KEY;
}

export interface PiUser {
  uid: string;
  username?: string;
}

export class PiAuthError extends Error {
  status = 401;
  code = "PI_AUTH_FAILED";
}

/** Verifies a Pi access token with Pi's servers (never trust the client's uid/username). */
export async function verifyAccessToken(accessToken: string): Promise<PiUser> {
  if (!accessToken || accessToken.length > 4096) throw new PiAuthError("Missing Pi access token");
  const res = await fetchWithTimeout(`${PI_API}/me`, { headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 10_000 });
  if (!res.ok) throw new PiAuthError(`Pi rejected the access token (${res.status})`);
  const me = (await res.json()) as { uid?: string; username?: string };
  if (!me?.uid) throw new PiAuthError("Pi returned no user");
  return { uid: String(me.uid), username: me.username ? String(me.username) : undefined };
}

/** Server-API-key call to the Pi Platform API (payments). */
export async function piServerCall<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.PI_API_KEY;
  if (!key) throw new Error("PI_API_KEY is not set");
  const res = await fetchWithTimeout(
    `${PI_API}${path}`,
    {
      method: init.method ?? "GET",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs: 15_000,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Pi API ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** A Pi payment as returned by GET /v2/payments/{id}. */
export interface PiPayment {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown> | null;
  direction?: "user_to_app" | "app_to_user";
  network?: string;
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  };
  transaction: null | { txid: string; verified: boolean; _link?: string };
}
