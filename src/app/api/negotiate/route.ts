import { z } from "zod";
import { originOf } from "@/lib/server/http";
import { negotiate } from "@/lib/server/negotiate";
import { verifyOffer } from "@/lib/server/sign";
import type { Offer } from "@/lib/types";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  offer: z.object({ sig: z.string() }).passthrough(),
  lang: z.enum(["ar", "en"]),
  competitor: z.object({ store: z.string().max(120), total: z.number().positive() }).optional(),
});

/** Streams the buyer↔seller agent conversation as NDJSON; ends with a newly signed offer. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "negotiate", 20, 600);
  if (limited) return limited;
  let b: z.infer<typeof Body>;
  try {
    b = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const offer = b.offer as unknown as Offer;
  if (!verifyOffer(offer)) {
    return Response.json({ error: "Offer could not be verified", code: "OFFER_TAMPERED_OR_EXPIRED" }, { status: 400 });
  }
  // The id is signed, so this can't be stripped: negotiated offers end in "-neg<time>" (base36 ids never contain "-").
  if (offer.flags?.includes("negotiated") || /-neg[0-9a-z]+$/.test(offer.id)) {
    return Response.json({ error: "This price was already negotiated", code: "ALREADY_NEGOTIATED" }, { status: 409 });
  }
  if (offer.flags?.includes("price_unverified")) {
    return Response.json({ error: "This price couldn't be confirmed on the store page", code: "PRICE_UNVERIFIED" }, { status: 409 });
  }
  if (offer.trust === "suspicious") {
    return Response.json({ error: "Not negotiating with a suspicious store", code: "SUSPICIOUS" }, { status: 403 });
  }

  const origin = originOf(req);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const ev of negotiate({ offer, lang: b.lang, origin, competitor: b.competitor, signal: req.signal })) {
          controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        }
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ type: "error", message: (e as Error).message }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
