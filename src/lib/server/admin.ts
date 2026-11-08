import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./settings";
import { signToken, verifyToken } from "./sign";
import { supabase, supabaseEnabled } from "./supabase";

/**
 * Owner login for /admin. The password is stored as a scrypt hash in app_settings
 * ("admin_password"); until one is set, ADMIN_SECRET / CRON_SECRET opens the panel once so the
 * owner can choose a password. A login gives a signed 12-hour admin token.
 */
interface PasswordHash {
  salt: string;
  hash: string;
}

const hashOf = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function passwordIsSet(): Promise<boolean> {
  return !!(await getSetting<PasswordHash | null>("admin_password", null))?.hash;
}

/** Returns an admin token, or null for a wrong password. `setup` = must choose a password now. */
export async function adminLogin(password: string): Promise<{ token: string; setup: boolean } | null> {
  const stored = await getSetting<PasswordHash | null>("admin_password", null);
  if (stored?.hash) {
    if (!same(hashOf(password, stored.salt), stored.hash)) return null;
    return { token: signToken({ k: "admin" }, 12 * 3600_000), setup: false };
  }
  const boot = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!boot || !same(password, boot)) return null;
  return { token: signToken({ k: "admin" }, 3600_000), setup: true };
}

export async function setAdminPassword(next: string): Promise<void> {
  if (next.length < 8) throw Object.assign(new Error("The password needs at least 8 characters."), { status: 400 });
  const salt = randomBytes(16).toString("hex");
  await setSetting("admin_password", { salt, hash: hashOf(next, salt) });
}

/** Admin token (from /api/admin/login) — or ADMIN_SECRET / CRON_SECRET for scripts. */
export function isAdmin(req: Request): boolean {
  const h = req.headers.get("authorization") ?? "";
  const tok = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!tok) return false;
  const boot = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (boot && same(tok, boot)) return true;
  return verifyToken<{ k: string }>(tok)?.k === "admin";
}

export function requireAdmin(req: Request): Response | null {
  return isAdmin(req) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}

/* ---------- overview numbers ---------- */

export interface Overview {
  users: number;
  newUsers7: number;
  activePacks: number;
  paymentsCompleted: number;
  revenuePi: number;
  orders30: number;
  merchantsPending: number;
}

export async function overview(): Promise<Overview> {
  if (!supabaseEnabled) return { users: 0, newUsers7: 0, activePacks: 0, paymentsCompleted: 0, revenuePi: 0, orders30: 0, merchantsPending: 0 };
  const db = supabase();
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const month = new Date(Date.now() - 30 * 864e5).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [users, newUsers7, activePacks, orders30, merchantsPending, pays] = await Promise.all([
    count(db.from("users").select("*", { count: "exact", head: true })),
    count(db.from("users").select("*", { count: "exact", head: true }).gte("created_at", week)),
    count(db.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active").gt("ends_at", new Date().toISOString())),
    count(db.from("orders").select("*", { count: "exact", head: true }).gte("created_at", month)),
    count(db.from("merchants").select("*", { count: "exact", head: true }).eq("status", "pending")),
    db.from("payments").select("amount").eq("status", "completed").limit(10000),
  ]);
  const amounts = (pays.data ?? []).map((p) => Number(p.amount) || 0);
  return { users, newUsers7, activePacks, paymentsCompleted: amounts.length, revenuePi: Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100, orders30, merchantsPending };
}
