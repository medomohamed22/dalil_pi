import { memAddPricePoint } from "@/lib/server/community";

export const runtime = "nodejs";

/** Local tests only: add older price points to the in-memory history. 404 everywhere else. */
export async function POST(req: Request) {
  if (process.env.VERCEL || process.env.DALIL_TEST_ALLOW_PRIVATE_STORES !== "1") return new Response("Not found", { status: 404 });
  const points = (await req.json()) as Parameters<typeof memAddPricePoint>[0][];
  points.forEach(memAddPricePoint);
  return Response.json({ ok: true, added: points.length });
}
