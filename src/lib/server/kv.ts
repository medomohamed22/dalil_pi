import "server-only";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Shared cache in the database (`kv_cache`) for results that are expensive to make (a headless
 * browser read): one instance makes it, the others read it. Errors never break the caller —
 * a failed read is a miss, a failed write is skipped.
 */
const mem = ((globalThis as unknown as { __dalilKv?: Map<string, { value: unknown; at: number }> }).__dalilKv ??= new Map());

export async function kvGet<T>(key: string): Promise<{ value: T; ageMs: number } | null> {
  if (!supabaseEnabled) {
    const hit = mem.get(key);
    return hit ? { value: hit.value as T, ageMs: Date.now() - hit.at } : null;
  }
  try {
    const { data, error } = await supabase().from("kv_cache").select("value, updated_at").eq("key", key).maybeSingle();
    if (error || !data) return null;
    return { value: data.value as T, ageMs: Date.now() - Date.parse(data.updated_at as string) };
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!supabaseEnabled) {
    mem.set(key, { value, at: Date.now() });
    return;
  }
  try {
    await supabase().from("kv_cache").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    /* next caller makes it again */
  }
}
