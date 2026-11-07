import "server-only";
import { z } from "zod";
import { supabase, supabaseEnabled } from "./supabase";
import type { Address } from "../types";

/** Saved shipping addresses per Pi account (Supabase `addresses`). */

export const AddressInput = z.object({
  label: z.string().trim().max(40).nullish(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(30).regex(/^[+0-9 ()-]+$/, "Invalid phone number"),
  country: z.string().trim().length(2).transform((c) => c.toUpperCase()),
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().max(80).nullish(),
  street: z.string().trim().min(2).max(200),
  building: z.string().trim().max(120).nullish(),
  postalCode: z.string().trim().max(20).nullish(),
  notes: z.string().trim().max(300).nullish(),
  isDefault: z.boolean().optional(),
});
export type AddressInputT = z.infer<typeof AddressInput>;

const MAX_ADDRESSES = 10;

interface Row {
  id: string;
  label: string | null;
  full_name: string;
  phone: string;
  country: string;
  city: string;
  area: string | null;
  street: string;
  building: string | null;
  postal_code: string | null;
  notes: string | null;
  is_default: boolean;
}

const fromRow = (r: Row): Address => ({
  id: r.id,
  label: r.label,
  fullName: r.full_name,
  phone: r.phone,
  country: r.country,
  city: r.city,
  area: r.area,
  street: r.street,
  building: r.building,
  postalCode: r.postal_code,
  notes: r.notes,
  isDefault: r.is_default,
});

const toRow = (a: Partial<AddressInputT>) => {
  const r: Record<string, unknown> = {};
  if (a.label !== undefined) r.label = a.label || null;
  if (a.fullName !== undefined) r.full_name = a.fullName;
  if (a.phone !== undefined) r.phone = a.phone;
  if (a.country !== undefined) r.country = a.country;
  if (a.city !== undefined) r.city = a.city;
  if (a.area !== undefined) r.area = a.area || null;
  if (a.street !== undefined) r.street = a.street;
  if (a.building !== undefined) r.building = a.building || null;
  if (a.postalCode !== undefined) r.postal_code = a.postalCode || null;
  if (a.notes !== undefined) r.notes = a.notes || null;
  return r;
};

/* in-memory fallback for local development */
const g = globalThis as unknown as { __dalilAddr?: Map<string, Address[]> };
const mem: Map<string, Address[]> = (g.__dalilAddr ??= new Map());

export class NotFound extends Error {
  status = 404;
  code = "NOT_FOUND";
}

export async function listAddresses(uid: string): Promise<Address[]> {
  if (!supabaseEnabled) return mem.get(uid) ?? [];
  const { data, error } = await supabase()
    .from("addresses")
    .select("*")
    .eq("pi_uid", uid)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`addresses: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

export async function getAddress(uid: string, id: string): Promise<Address> {
  const all = await listAddresses(uid);
  const a = all.find((x) => x.id === id);
  if (!a) throw new NotFound("Address not found");
  return a;
}

async function clearDefault(uid: string) {
  if (!supabaseEnabled) {
    mem.set(uid, (mem.get(uid) ?? []).map((a) => ({ ...a, isDefault: false })));
    return;
  }
  const { error } = await supabase().from("addresses").update({ is_default: false }).eq("pi_uid", uid).eq("is_default", true);
  if (error) throw new Error(`addresses: ${error.message}`);
}

export async function createAddress(uid: string, input: AddressInputT): Promise<Address> {
  const existing = await listAddresses(uid);
  if (existing.length >= MAX_ADDRESSES) throw Object.assign(new Error(`Up to ${MAX_ADDRESSES} addresses`), { status: 400, code: "TOO_MANY" });
  // The first address is always the default one.
  const makeDefault = input.isDefault === true || existing.length === 0;
  if (makeDefault) await clearDefault(uid);
  if (!supabaseEnabled) {
    const a: Address = {
      id: crypto.randomUUID(),
      label: input.label ?? null,
      fullName: input.fullName,
      phone: input.phone,
      country: input.country,
      city: input.city,
      area: input.area ?? null,
      street: input.street,
      building: input.building ?? null,
      postalCode: input.postalCode ?? null,
      notes: input.notes ?? null,
      isDefault: makeDefault,
    };
    mem.set(uid, [a, ...(mem.get(uid) ?? [])]);
    return a;
  }
  const { data, error } = await supabase()
    .from("addresses")
    .insert({ pi_uid: uid, ...toRow(input), is_default: makeDefault })
    .select("*")
    .single();
  if (error) throw new Error(`addresses: ${error.message}`);
  return fromRow(data as Row);
}

export async function updateAddress(uid: string, id: string, input: Partial<AddressInputT>): Promise<Address> {
  await getAddress(uid, id);
  if (input.isDefault) await clearDefault(uid);
  if (!supabaseEnabled) {
    const list = mem.get(uid) ?? [];
    const next = list.map((a) =>
      a.id === id
        ? { ...a, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), isDefault: input.isDefault ?? a.isDefault }
        : a,
    ) as Address[];
    mem.set(uid, next);
    return next.find((a) => a.id === id)!;
  }
  const patch = { ...toRow(input), ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}) };
  const { data, error } = await supabase().from("addresses").update(patch).eq("pi_uid", uid).eq("id", id).select("*").single();
  if (error) throw new Error(`addresses: ${error.message}`);
  return fromRow(data as Row);
}

export async function deleteAddress(uid: string, id: string): Promise<void> {
  const a = await getAddress(uid, id);
  if (!supabaseEnabled) {
    const rest = (mem.get(uid) ?? []).filter((x) => x.id !== id);
    if (a.isDefault && rest[0]) rest[0] = { ...rest[0], isDefault: true };
    mem.set(uid, rest);
    return;
  }
  const { error } = await supabase().from("addresses").delete().eq("pi_uid", uid).eq("id", id);
  if (error) throw new Error(`addresses: ${error.message}`);
  if (a.isDefault) {
    const rest = await listAddresses(uid);
    if (rest[0]) await supabase().from("addresses").update({ is_default: true }).eq("pi_uid", uid).eq("id", rest[0].id);
  }
}
