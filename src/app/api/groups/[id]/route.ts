import { getGroup } from "@/lib/server/groups";
import { deviceOf, groupFail } from "@/lib/server/group-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json({ group: await getGroup(id, deviceOf(req)) });
  } catch (e) {
    return groupFail(e);
  }
}
