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
