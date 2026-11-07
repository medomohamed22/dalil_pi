import { z } from "zod";
import { pushConfigured, vapidPublicKey } from "@/lib/server/push";
import { setPushSubscription } from "@/lib/server/watches";
import { device, fail } from "@/lib/server/watch-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ configured: pushConfigured, publicKey: vapidPublicKey });
}

const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.microsoft.com"];

const Sub = z.object({
  // Only real browser push services — never an arbitrary URL the server would POST to.
  endpoint: z
    .string()
    .url()
    .startsWith("https://")
    .refine((u) => PUSH_HOSTS.some((h) => new URL(u).hostname === h || new URL(u).hostname.endsWith(`.${h}`)), "Unknown push service"),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function PUT(req: Request) {
  const limited = await rateLimit(req, "push", 20, 3600);
  if (limited) return limited;
  try {
    const sub = Sub.parse(await req.json());
    await setPushSubscription(device(req), sub);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid subscription" }, { status: 400 });
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await setPushSubscription(device(req), null);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
