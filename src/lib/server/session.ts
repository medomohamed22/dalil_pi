import "server-only";
import { signToken, verifyToken } from "./sign";

/**
 * Session = signed token with the Pi uid, issued after Pi verified the user's
 * access token. Sent by the client as `Authorization: Bearer <token>` (not a
 * cookie: the Pi Sandbox runs the app inside an iframe where third-party
 * cookies are blocked).
 */
export interface Session {
  uid: string;
  username?: string;
  /** "dev" sessions exist only in local development (never on Vercel). */
  kind: "pi" | "dev";
}

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export function issueSession(s: Session): string {
  return signToken({ k: "session", ...s }, SESSION_TTL_MS);
}

export function readSession(req: Request): Session | null {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const d = verifyToken<Session & { k: string }>(token || undefined);
  if (!d || d.k !== "session" || !d.uid) return null;
  if (d.kind === "dev" && !devLoginAllowed()) return null;
  return { uid: d.uid, username: d.username, kind: d.kind };
}

/** Local development only: lets you test outside the Pi Browser. Always off on Vercel. */
export function devLoginAllowed(): boolean {
  return !process.env.VERCEL && process.env.ALLOW_DEV_LOGIN === "1";
}

export class AuthRequired extends Error {
  status = 401;
  code = "SIGN_IN_REQUIRED";
  constructor() {
    super("Sign in with Pi to continue.");
  }
}
