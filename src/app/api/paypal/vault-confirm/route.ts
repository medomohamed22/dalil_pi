import { createPaymentToken } from "@/lib/server/paypal";
import { clearVault, setVault } from "@/lib/server/watches";
import { device, fail } from "@/lib/server/watch-http";

export const runtime = "nodejs";

/** Buyer approved the setup token → exchange it for a vaulted payment token (kept server-side only). */
export async function POST(req: Request) {
  try {
    const d = device(req);
    const { setupTokenId } = (await req.json()) as { setupTokenId?: string };
    const t = await createPaymentToken(String(setupTokenId ?? ""));
    await setVault(d, t.id);
    return Response.json({ connected: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await clearVault(device(req));
    return Response.json({ connected: false });
  } catch (e) {
    return fail(e);
  }
}
