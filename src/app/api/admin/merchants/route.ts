import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { listAllMerchants, setMerchantStatus } from "@/lib/server/merchants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return Response.json({ merchants: await listAllMerchants() }, { headers: { "Cache-Control": "no-store" } });
}

/** { id, status: "approved" | "rejected" | "pending" } */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const b = z.object({ id: z.string().min(1).max(64), status: z.enum(["pending", "approved", "rejected"]) }).parse(await req.json());
    await setMerchantStatus(b.id, b.status);
    return Response.json({ ok: true });
  } catch (err) {
    const e = err as { status?: number; message: string };
    return Response.json({ error: e.message }, { status: e.status ?? 400 });
  }
}
