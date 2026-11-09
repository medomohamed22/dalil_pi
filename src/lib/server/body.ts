import "server-only";

export class BodyTooLarge extends Error {
  status = 413;
  code = "TOO_LARGE";
}

/**
 * Reads a JSON body with a hard size cap, counting bytes as they arrive (a missing or false
 * Content-Length can't get around it), and only then parses it.
 */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLarge("Request too large");
  if (!req.body) return JSON.parse("");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge("Request too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
