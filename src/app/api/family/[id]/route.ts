import { familyFail, getFamily } from "@/lib/server/family";
import { deviceOf } from "@/lib/server/group-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json({ request: await getFamily(id, deviceOf(req)) });
  } catch (e) {
    return familyFail(e);
  }
}
