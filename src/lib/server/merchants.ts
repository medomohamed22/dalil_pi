import "server-only";
import { z } from "zod";
import { supabase, supabaseEnabled } from "./supabase";
import type { Merchant } from "../types";

/**
 * "Dalil Pi for merchants": a shop registers itself with its Pi account.
 * It starts as pending; once approved (Supabase table editor, or
 * MERCHANTS_AUTO_APPROVE=1) the agent can find it with the dalil_merchants tool.
 */
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((u) => {
    try {
      return ["https:", "http:"].includes(new URL(u).protocol);
    } catch {
      return false;
    }
  }, "Must be a web address");

export const MerchantInput = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["online", "local", "service"]),
  country: z.string().trim().length(2).transform((c) => c.toUpperCase()),
  city: z.string().trim().max(80).nullish(),
  address: z.string().trim().max(200).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lon: z.number().min(-180).max(180).nullish(),
  phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Invalid phone").nullish(),
  website: httpsUrl.nullish().or(z.literal("").transform(() => null)),
  description: z.string().trim().max(400).nullish(),
  categories: z.string().trim().max(200).nullish(),
  items: z.array(z.object({ title: z.string().trim().min(1).max(120), price: z.number().positive().max(10_000_000) })).max(20).default([]),
  piWallet: z.string().trim().max(80).regex(/^[A-Z0-9]*$/, "Wallet address: capital letters and digits").nullish(),
});
export type MerchantInputT = z.infer<typeof MerchantInput>;

interface Row {
  id: string;
  pi_uid: string;
  name: string;
  kind: Merchant["kind"];
  country: string;
  city: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  categories: string | null;
  items: { title: string; price: number }[];
  pi_wallet: string | null;
  status: Merchant["status"];
  created_at: string;
}
const toMerchant = (r: Row): Merchant => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  country: r.country,
  city: r.city,
  address: r.address,
  lat: r.lat,
  lon: r.lon,
  phone: r.phone,
  website: r.website,
  description: r.description,
  categories: r.categories,
  items: r.items ?? [],
  piWallet: r.pi_wallet,
  status: r.status,
});
const autoApprove = () => process.env.MERCHANTS_AUTO_APPROVE === "1";
const mem = ((globalThis as unknown as { __dalilMerchants?: Row[] }).__dalilMerchants ??= []);

export async function getMyMerchant(uid: string): Promise<Merchant | null> {
  if (!supabaseEnabled) {
    const r = mem.find((x) => x.pi_uid === uid);
    return r ? toMerchant(r) : null;
  }
  const { data, error } = await supabase().from("merchants").select("*").eq("pi_uid", uid).maybeSingle();
  if (error) throw new Error(`merchants: ${error.message}`);
  return data ? toMerchant(data as Row) : null;
}

/** Create or update the user's shop. Any change sends it back to review (unless auto-approve is on). */
export async function saveMyMerchant(uid: string, input: MerchantInputT): Promise<Merchant> {
  const row = {
    pi_uid: uid,
    name: input.name,
    kind: input.kind,
    country: input.country,
    city: input.city ?? null,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    phone: input.phone || null,
    website: input.website || null,
    description: input.description ?? null,
    categories: input.categories ?? null,
    items: input.items,
    pi_wallet: input.piWallet || null,
    status: (autoApprove() ? "approved" : "pending") as Row["status"],
  };
  if (!supabaseEnabled) {
    const i = mem.findIndex((x) => x.pi_uid === uid);
    const r: Row = { ...(i >= 0 ? mem[i] : { id: crypto.randomUUID(), created_at: new Date().toISOString() }), ...row } as Row;
    if (i >= 0) mem[i] = r;
    else mem.push(r);
    return toMerchant(r);
  }
  const { data, error } = await supabase().from("merchants").upsert(row, { onConflict: "pi_uid" }).select("*").single();
  if (error) throw new Error(`merchants: ${error.message}`);
  return toMerchant(data as Row);
}

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/[%_]/g, ""))
    .filter((w) => w.length > 1)
    .slice(0, 6);

/** Approved merchants in a country matching the keywords (name, categories, description, items). */
export async function searchMerchants(opts: { country: string; query?: string; kind?: Merchant["kind"]; limit?: number }): Promise<Merchant[]> {
  const ws = words(opts.query ?? "");
  const match = (m: Row) => {
    if (!ws.length) return true;
    const hay = [m.name, m.categories, m.description, ...(m.items ?? []).map((i) => i.title)].join(" ").toLowerCase();
    return ws.some((w) => hay.includes(w));
  };
  let rows: Row[];
  if (!supabaseEnabled) rows = mem.filter((m) => m.status === "approved" && m.country === opts.country);
  else {
    let q = supabase().from("merchants").select("*").eq("status", "approved").eq("country", opts.country).limit(200);
    if (opts.kind) q = q.eq("kind", opts.kind);
    const { data, error } = await q;
    // Table not created yet (migration 0008 pending): no registered merchants, not an error.
    if (error && /does not exist|schema cache|PGRST205/i.test(`${error.code} ${error.message}`)) return [];
    if (error) throw new Error(`merchants: ${error.message}`);
    rows = data as Row[];
  }
  return rows.filter((m) => (!opts.kind || m.kind === opts.kind) && match(m)).slice(0, opts.limit ?? 8).map(toMerchant);
}

/** Shop name by id (approved or not) — used for question lists. */
export async function getMerchantName(id: string): Promise<string | null> {
  if (!supabaseEnabled) return mem.find((m) => m.id === id)?.name ?? null;
  const { data } = await supabase().from("merchants").select("name").eq("id", id).maybeSingle();
  return (data?.name as string) ?? null;
}
