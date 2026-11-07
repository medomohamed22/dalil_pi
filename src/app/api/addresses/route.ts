import { AddressInput, createAddress, listAddresses } from "@/lib/server/addresses";
import { errorJson, requireSession } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's saved shipping addresses. */
export async function GET(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    return Response.json({ addresses: await listAddresses(s.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorJson(err);
  }
}

export async function POST(req: Request) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const input = AddressInput.parse(await req.json());
    return Response.json({ address: await createAddress(s.uid, input) }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
