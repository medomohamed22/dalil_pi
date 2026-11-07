import { z } from "zod";
import { PiAuthError, verifyAccessToken } from "@/lib/server/pi";
import { rateLimit } from "@/lib/server/ratelimit";
import { devLoginAllowed, issueSession } from "@/lib/server/session";
import { getUsage, upsertUser } from "@/lib/server/users";
import type { Me } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Sign in with Pi: the client sends the access token from Pi.authenticate();
 * we verify it with Pi's servers (GET /v2/me) and return our own session token.
 * Local development can use { dev: "name" } when ALLOW_DEV_LOGIN=1 (never on Vercel).
 */
const Body = z.union([
  z.object({ accessToken: z.string().min(10).max(4096) }),
  z.object({ dev: z.string().min(1).max(40) }),
]);

export async function POST(req: Request) {
  const limited = await rateLimit(req, "auth", 20, 600);
  if (limited) return limited;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    let uid: string;
    let username: string | undefined;
    let kind: "pi" | "dev" = "pi";
    if ("dev" in body) {
      if (!devLoginAllowed()) return Response.json({ error: "Dev login is disabled" }, { status: 403 });
      uid = `dev-${body.dev.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "user"}`;
      username = body.dev;
      kind = "dev";
    } else {
      const u = await verifyAccessToken(body.accessToken);
      uid = u.uid;
      username = u.username;
    }
    const prefs = await upsertUser(uid, username);
    const me: Me = { uid, username, usage: await getUsage(uid), country: prefs.country, lang: prefs.lang, email: prefs.email };
    return Response.json({ token: issueSession({ uid, username, kind }), me });
  } catch (err) {
    if (err instanceof PiAuthError) return Response.json({ error: err.message, code: err.code }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Sign-in failed" }, { status: 500 });
  }
}
