import { AddressInput, deleteAddress, updateAddress } from "@/lib/server/addresses";
import { errorJson, requireSession } from "@/lib/server/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { id } = await params;
    const input = AddressInput.partial().parse(await req.json());
    return Response.json({ address: await updateAddress(s.uid, id, input) });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const s = requireSession(req);
  if (s instanceof Response) return s;
  try {
    const { id } = await params;
    await deleteAddress(s.uid, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
