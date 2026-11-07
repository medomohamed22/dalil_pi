import "server-only";
import { PayPalError } from "./paypal";
import { TokenError } from "./sign";

export function errorResponse(err: unknown): Response {
  if (err instanceof SyntaxError) return Response.json({ error: "Invalid request", code: "BAD_JSON" }, { status: 400 });
  if (err instanceof TokenError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof PayPalError) {
    return Response.json({ error: err.message, code: err.code, debugId: err.debugId }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return Response.json({ error: msg, code: "SERVER_ERROR" }, { status: 500 });
}

export function originOf(req: Request): string {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
