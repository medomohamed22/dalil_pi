import "server-only";
import dns from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent } from "undici";

/**
 * SSRF guard: the agent and the user can hand us arbitrary URLs (product links,
 * custom API base URLs). Only allow public http(s) hosts.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) || // 192.0.0.0/24 + 192.0.2.0/24
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  // IPv4-mapped / -translated forms (::ffff:127.0.0.1, ::ffff:7f00:1, 64:ff9b::7f00:1)
  const mapped = v.match(/^(?:::ffff:|64:ff9b::)(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    if (mapped[1]) return isPrivateIp(mapped[1]);
    const hi = parseInt(mapped[2], 16);
    const lo = parseInt(mapped[3], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return (
    v === "::1" ||
    v === "::" ||
    v.startsWith("::ffff:") ||
    v.startsWith("64:ff9b:") ||
    v.startsWith("2002:") || // 6to4 can wrap any IPv4
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    /^fe[89ab]/.test(v) ||
    v.startsWith("ff")
  );
}

/**
 * The same guard at connect time: the address the socket really connects to must be public.
 * assertPublicUrl alone can be fooled by DNS rebinding (a host that answers a public address for
 * the check, then 127.0.0.1 / 169.254.169.254 for the request).
 */
const guardOff = () => !process.env.VERCEL && process.env.DALIL_TEST_ALLOW_PRIVATE_STORES === "1";
let publicAgent: Agent | null = null;
function guardedAgent(): Agent {
  return (publicAgent ??= new Agent({
    connect: {
      lookup(host: string, opts: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
        dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
          if (err) return cb(err, []);
          if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return cb(Object.assign(new Error(`Host not allowed: ${host}`), { code: "ENOTFOUND" }), []);
          if (opts.all) cb(null, addrs);
          else cb(null, addrs[0].address, addrs[0].family);
        });
      },
    },
  }));
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Host not allowed");
  }
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Host not allowed");
  }
  return url;
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = { ...rest, signal: rest.signal ?? ctrl.signal, ...(guardOff() ? {} : { dispatcher: guardedAgent() }) };
    return await fetch(input, init as RequestInit);
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body up to maxBytes (product pages can be huge). */
export async function readLimited(res: Response, maxBytes = 2_500_000): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c))),
  );
}
