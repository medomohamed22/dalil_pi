import { createVaultSetupToken } from "@/lib/server/paypal";
import { originOf } from "@/lib/server/http";
import { device, fail } from "@/lib/server/watch-http";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

/** Start "save PayPal for auto-buy" (Vault without purchase). */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "vault", 10, 600);
  if (limited) return limited;
  try {
    device(req);
    const o = originOf(req);
    return Response.json(await createVaultSetupToken(`${o}/paypal/return?flow=vault`, `${o}/paypal/cancel?flow=vault`));
  } catch (e) {
    return fail(e);
  }
}
