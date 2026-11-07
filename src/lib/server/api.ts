import "server-only";
import { ZodError } from "zod";
import { readSession, type Session } from "./session";

/** Small helpers shared by the JSON API routes. */

export function requireSession(req: Request): Session | Response {
  const s = readSession(req);
  return s ?? Response.json({ error: "Sign in with Pi to continue.", code: "SIGN_IN_REQUIRED" }, { status: 401 });
}

export function errorJson(err: unknown): Response {
  if (err instanceof ZodError) {
    return Response.json({ error: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), code: "INVALID" }, { status: 400 });
  }
  const e = err as { status?: number; code?: string; message?: string; usage?: unknown };
  return Response.json({ error: e.message ?? "Error", code: e.code, usage: e.usage }, { status: e.status ?? 500 });
}
