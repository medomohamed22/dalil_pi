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

export function supabase(): SupabaseClient {
  if (!supabaseEnabled) throw new Error("SUPABASE_NOT_CONFIGURED");
  client ??= createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "dalil-pi" } },
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
