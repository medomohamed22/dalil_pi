import { z } from "zod";
import { runAgent } from "@/lib/server/agent";
import { runDemo } from "@/lib/server/demo";
import { hostedConfig, hostedEnabled, takeHostedQuota } from "@/lib/server/hosted";
import { verifyOffer } from "@/lib/server/sign";
import type { AgentEvent, Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The agent always runs on the server's Meta key (META_API_KEY in the Vercel
 * environment) with one fixed model, for the US market in English. Whatever a
 * client sends for key, base URL, model, market or language is ignored.
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
      reasoningEffort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
      city: z.string().min(1).max(80).optional(),
      /** Scripted sample data without the model — only for the automated test suites. */
      demoMode: z.boolean().optional(),
      coords: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullish(),
    })
    .passthrough()
    .default({}),
  /** Offers Dalil already signed in this conversation — lets follow-ups ("buy the 2nd one") reuse their verified prices. */
  offers: z.array(z.object({ sig: z.string() }).passthrough()).max(60).optional(),
});

const MARKET = "US" as const;
const LANG = "en" as const;
const US_CITIES = ["New York", "Los Angeles", "Chicago", "Houston", "San Francisco", "Seattle", "Boston", "Miami", "Austin", "Denver"];

export async function POST(req: Request) {
  const limited = await rateLimit(req, "chat", 40, 600);
  if (limited) return limited;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { settings, history } = body;
  const city = settings.city && US_CITIES.includes(settings.city) ? settings.city : "New York";
  const last = history[history.length - 1];
  const knownOffers = ((body.offers ?? []) as unknown as Offer[]).filter((o) => verifyOffer(o) && !o.flags?.includes("price_unverified"));

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
        if (settings.demoMode) {
          await runDemo({ text: last.text, hasImage: !!last.images?.length, market: MARKET, city, lang: LANG, signal: req.signal, emit });
        } else {
          if (!hostedEnabled()) throw new Error("NO_API_KEY");
          await takeHostedQuota(req);
          await runAgent({
            cfg: hostedConfig(settings.reasoningEffort ?? "low"),
            history,
            market: MARKET,
            city,
            coords: settings.coords ?? undefined,
            lang: LANG,
            signal: req.signal,
            emit,
            knownOffers,
            trustedSearch: true,
          });
        }
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
