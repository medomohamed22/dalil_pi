import { z } from "zod";
import { isCountryCode } from "@/lib/server/geo";
import { readSession } from "@/lib/server/session";
import { meState, updatePrefs } from "@/lib/server/users";
import type { Me } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user, their monthly usage and saved preferences. */
export async function GET(req: Request) {
  const s = readSession(req);
  if (!s) return Response.json({ error: "Sign in with Pi to continue.", code: "SIGN_IN_REQUIRED" }, { status: 401 });
  try {
    const { prefs, usage } = await meState(s.uid, s.username);
    const me: Me = { uid: s.uid, username: s.username, usage, country: prefs.country, lang: prefs.lang, email: prefs.email };
    return Response.json(me, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}

const Patch = z.object({
  country: z.string().length(2).nullable().optional(),
  lang: z.enum(["en", "ar"]).optional(),
});

/** Save the user's country (null = back to the IP country) and language. */
export async function PATCH(req: Request) {
  const s = readSession(req);
  if (!s) return Response.json({ error: "Sign in with Pi to continue.", code: "SIGN_IN_REQUIRED" }, { status: 401 });
  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const country = body.country === undefined ? undefined : body.country === null ? null : body.country.toUpperCase();
  if (country && !isCountryCode(country)) return Response.json({ error: "Invalid country" }, { status: 400 });
  try {
    await updatePrefs(s.uid, { country, lang: body.lang });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
