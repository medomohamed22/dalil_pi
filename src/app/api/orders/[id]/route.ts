import { z } from "zod";
import { errorJson, requireSession } from "@/lib/server/api";
import { updateOrder } from "@/lib/server/orders";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  status: z.enum(["placed", "paid", "shipped", "delivered", "cancelled"]).optional(),
  txid: z.string().trim().max(128).nullable().optional(),
  trackingNumber: z.string().trim().max(80).nullable().optional(),
});

/** The buyer updates their own order (e.g. "I paid", "delivered", "cancel"). */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { id } = await params;
    return Response.json({ order: await updateOrder(s.uid, id, Patch.parse(await req.json())) });
  } catch (err) {
    return errorJson(err);
  }
}
