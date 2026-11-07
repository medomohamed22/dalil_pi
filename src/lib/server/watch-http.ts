import "server-only";
import { PayPalError } from "./paypal";
import { WatchError, deviceHash } from "./watches";

export function device(req: Request): string {
  return deviceHash(req.headers.get("x-device-id"));
}

export function fail(err: unknown): Response {
  if (err instanceof SyntaxError) return Response.json({ error: "Invalid request", code: "BAD_JSON" }, { status: 400 });
  if (err instanceof WatchError || err instanceof PayPalError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  return Response.json({ error: err instanceof Error ? err.message : String(err), code: "SERVER_ERROR" }, { status: 500 });
}
