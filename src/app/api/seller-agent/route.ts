import { z } from "zod";
import { PROTOCOL, sellerTurn } from "@/lib/server/seller";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

const Body = z.object({
  protocol: z.literal(PROTOCOL),
  session: z.string().max(2000).optional(),
  item: z.object({
    title: z.string().min(1).max(300),
    store: z.string().min(1).max(120),
    price: z.number().positive().max(10_000_000),
    shipping: z.number().min(0).max(1_000_000),
    currency: z.string().min(3).max(3),
  }),
  message: z.object({
    type: z.enum(["hello", "bid", "accept"]),
    price: z.number().min(0).max(10_000_000).optional(),
    ask: z.array(z.string().max(40)).max(5).optional(),
  }),
});

/** Demo store-side agent for agent-to-agent negotiation (see lib/server/seller.ts). */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "seller", 300, 600);
  if (limited) return limited;
  try {
    const b = Body.parse(await req.json());
    return Response.json({ protocol: PROTOCOL, ...sellerTurn(b) });
  } catch {
    return Response.json({ error: "Invalid request", protocol: PROTOCOL }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({ protocol: PROTOCOL, role: "seller", demo: true, messages: ["hello", "bid", "accept"] });
}
