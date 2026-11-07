import { storageEnvNames, storePersistent } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ops diagnostics (Bearer CRON_SECRET): which storage variables exist — names only, never values. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ storePersistent, storageEnvNames });
}
