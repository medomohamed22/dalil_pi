import "server-only";
import { GroupError } from "./groups";
import { PayPalError } from "./paypal";
import { deviceHash } from "./watches";

export function deviceOf(req: Request): string | undefined {
  try {
    return deviceHash(req.headers.get("x-device-id"));
  } catch {
    return undefined;
  }
}

export function groupFail(e: unknown): Response {
  if (e instanceof SyntaxError) return Response.json({ error: "Invalid request", code: "BAD_JSON" }, { status: 400 });
  if (e instanceof GroupError || e instanceof PayPalError) {
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
  return Response.json({ error: e instanceof Error ? e.message : String(e), code: "SERVER_ERROR" }, { status: 500 });
}
