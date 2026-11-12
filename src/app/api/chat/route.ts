import { after } from "next/server";
import { BodyTooLarge, readJson } from "@/lib/server/body";
import { z } from "zod";
import { runAgent } from "@/lib/server/agent";
import { boundHistory } from "@/lib/server/chat-bounds";
import { refreshInBackground } from "@/lib/server/catalog";
import { countryName, currencyOf, geoFromRequest, isCountryCode } from "@/lib/server/geo";
import { hostedConfig, hostedEnabled, hostedLimits, visitorId } from "@/lib/server/hosted";
import { piUsdPrice } from "@/lib/server/price";
import { readSession } from "@/lib/server/session";
import { verifyOffer } from "@/lib/server/sign";
import { beginSearch, refundSearch, reserveSearch } from "@/lib/server/users";
import type { AgentEvent, Offer } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
const CHAT_MAX_BYTES = 4_000_000;

/**
 * Runs the shopping agent for a signed-in Pi user. The agent always runs on
 * the server's Meta key (META_API_KEY) with one fixed model. Each question takes one AI credit
 * up front (given back only if the server fails).
 */
const Body = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(20000),
        images: z.array(z.string().max(8_000_000)).max(4).optional(),
      }),
    )
    .min(1)
    .max(60),
  settings: z
    .object({
      lang: z.enum(["en", "ar"]).optional(),
      /** Country the user picked; omitted/null = from the IP. */
      country: z.string().length(2).nullish(),
      scope: z.enum(["auto", "online", "local", "services"]).optional(),
      coords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullish(),
      prefs: z
        .object({ budgetPi: z.number().min(0).max(10_000_000).nullish(), brands: z.string().max(120).nullish(), shipOnly: z.boolean().optional() })
        .nullish(),
    })
    .default({}),
  /** Offers Dalil already signed in this conversation — lets follow-ups reuse their verified prices. */
  offers: z.array(z.object({ sig: z.string() }).passthrough()).max(60).optional(),
});

function errorResponse(err: unknown) {
  const e = err as { status?: number; code?: string; message?: string; usage?: unknown };
  return Response.json({ error: e.message ?? "Error", code: e.code, usage: e.usage }, { status: e.status ?? 500 });
}

export async function POST(req: Request) {
  const session = readSession(req);
  if (!session) return Response.json({ error: "Sign in with Pi to continue.", code: "SIGN_IN_REQUIRED" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    // Up to 4 MB (photos included) — under Vercel's 4.5 MB request limit, checked before parsing.
    body = Body.parse(await readJson(req, CHAT_MAX_BYTES));
  } catch (e) {
    if (e instanceof BodyTooLarge) return Response.json({ error: "Request too large — send fewer or smaller photos.", code: e.code }, { status: 413 });
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const bounded = boundHistory(body.history);
  if (!bounded) return Response.json({ error: "Photos must be JPEG, PNG or WebP images.", code: "BAD_IMAGE" }, { status: 400 });
  if (!bounded.length || bounded[bounded.length - 1].role !== "user") return Response.json({ error: "Invalid request" }, { status: 400 });
  body.history = bounded;
  if (!hostedEnabled()) return Response.json({ error: "The AI is not configured (META_API_KEY).", code: "NO_API_KEY" }, { status: 503 });

  // Quota, rate limits and daily AI caps in one database call — no AI call when anything is over.
  let receipt: Awaited<ReturnType<typeof reserveSearch>>;
  try {
    await beginSearch(session.uid, visitorId(req), hostedLimits());
    // The credit is taken now, before any AI call (atomic): parallel requests can't overspend
    // and closing the connection mid-answer doesn't make it free.
    receipt = await reserveSearch(session.uid);
  } catch (err) {
    return errorResponse(err);
  }
  const spent = receipt;

  const { settings, history } = body;
  const lang = settings.lang ?? "en";
  const geo = geoFromRequest(req);
  const picked = settings.country?.toUpperCase();
  const country = isCountryCode(picked) ? picked : geo.country;
  const locale = {
    country,
    countryName: countryName(country, "en"),
    city: country === geo.country ? geo.city : undefined,
    currency: currencyOf(country),
  };
  const knownOffers = ((body.offers ?? []) as unknown as Offer[]).filter((o) => verifyOffer(o) && !o.flags?.includes("price_unverified"));
  const price = await piUsdPrice();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (e: AgentEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client went away */
        }
      };
      try {
        await runAgent({
          cfg: hostedConfig("low"),
          history,
          locale,
          scope: settings.scope ?? "auto",
          coords: settings.coords ?? undefined,
          prefs: settings.prefs ?? undefined,
          // Map of Pi fallback when the user didn't share GPS — only if they shop in the IP's country.
          ipCoords: country === geo.country && geo.lat != null && geo.lon != null ? { lat: geo.lat, lon: geo.lon } : undefined,
          lang,
          piUsd: price?.usd,
          signal: req.signal,
          emit,
          knownOffers,
          trustedSearch: true,
        });
        emit({ type: "usage", usage: spent.usage });
      } catch (err) {
        // Our failure (not the user leaving): give the credit back.
        if (!req.signal.aborted) await refundSearch(session.uid, spent.source);
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  // After the reply: re-read any trusted store whose copy in Dalil Index is stale (never delays the user).
  after(() => refreshInBackground());

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
