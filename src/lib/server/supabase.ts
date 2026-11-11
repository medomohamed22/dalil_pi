import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client (service-role key). Never import this from a
 * client component: the service-role key bypasses Row Level Security.
 */
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = !!(url && key);

let client: SupabaseClient | null = null;

/**
 * Database calls made by this server instance (admin "performance" tab): how many, how long, per
 * table or function. Only names and timings — never a query's values.
 */
export interface DbUsage {
  since: number;
  calls: number;
  ms: number;
  errors: number;
  by: Record<string, { calls: number; ms: number }>;
}
const usage: DbUsage = ((globalThis as unknown as { __dalilDbUsage?: DbUsage }).__dalilDbUsage ??= { since: Date.now(), calls: 0, ms: 0, errors: 0, by: {} });
export const dbUsage = (): DbUsage => usage;

const counted: typeof fetch = async (input, init) => {
  const started = Date.now();
  const path = (() => {
    try {
      const p = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
      const m = p.match(/\/rest\/v1\/(rpc\/)?([\w-]+)/);
      return m ? `${init?.method ?? "GET"} ${m[1] ? "rpc:" : ""}${m[2]}` : "other";
    } catch {
      return "other";
    }
  })();
  try {
    const res = await fetch(input, init);
    if (!res.ok) usage.errors++;
    return res;
  } catch (e) {
    usage.errors++;
    throw e;
  } finally {
    const ms = Date.now() - started;
    usage.calls++;
    usage.ms += ms;
    const b = (usage.by[path] ??= { calls: 0, ms: 0 });
    b.calls++;
    b.ms += ms;
  }
};

export function supabase(): SupabaseClient {
  if (!supabaseEnabled) throw new Error("SUPABASE_NOT_CONFIGURED");
  client ??= createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "dalil-pi" }, fetch: counted },
  });
  return client;
}

/**
 * Every row of a query, read 1,000 at a time (the API caps one request at 1,000 rows).
 * `page(from, to)` must build the query with a stable order and `.range(from, to)`.
 */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, Math.min(from + 999, max - 1));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}
