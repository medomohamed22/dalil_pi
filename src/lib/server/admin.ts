import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./settings";
import { signToken, verifyToken } from "./sign";
import { counters } from "./store";
import { allRows, supabase, supabaseEnabled } from "./supabase";

/**
 * Owner login for /admin. The password is stored as a scrypt hash in app_settings
 * ("admin_password"); until one is set, ADMIN_SECRET / CRON_SECRET opens the panel once so the
 * owner can choose a password. A login gives a signed 12-hour admin token tied to the current
 * password: changing the password signs every open session out.
 * Wrong passwords are counted in the database (all server instances): 8 per visitor and 100 in
 * total per 15 minutes, then logins wait.
 */
interface PasswordHash {
  salt: string;
  hash: string;
}
interface AdminToken {
  k: string;
  /** First characters of the password hash it was made with ("boot" = setup token). */
  pv?: string;
}

const hashOf = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");
const versionOf = (stored: PasswordHash | null) => (stored?.hash ? stored.hash.slice(0, 12) : "boot");
const stored = () => getSetting<PasswordHash | null>("admin_password", null);

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function passwordIsSet(): Promise<boolean> {
  return !!(await stored())?.hash;
}

export class AdminLocked extends Error {
  status = 429;
  code = "ADMIN_LOCKED";
  constructor() {
    super("Too many wrong passwords — try again in 15 minutes.");
  }
}

const window15 = () => Math.floor(Date.now() / 900_000);
/** Counts one wrong password; true when this visitor (8) or everyone together (100) is over. */
async function tooManyFailures(visitor: string): Promise<boolean> {
  const w = window15();
  const [mine, all] = await Promise.all([counters.incr(`admin-fail:${visitor}:${w}`, 905), counters.incr(`admin-fail:all:${w}`, 905)]);
  return mine > 8 || all > 100;
}
/** Every login attempt counts (12 per visitor per 15 min) so a locked visitor stays locked. */
async function lockedOut(visitor: string): Promise<boolean> {
  return (await counters.incr(`admin-try:${visitor}:${window15()}`, 905)) > 12;
}

/** Returns an admin token, or null for a wrong password. `setup` = must choose a password now. */
export async function adminLogin(password: string, visitor = "unknown"): Promise<{ token: string; setup: boolean } | null> {
  if (await lockedOut(visitor)) throw new AdminLocked();
  const cur = await stored();
  let ok = false;
  let setup = false;
  if (cur?.hash) ok = same(hashOf(password, cur.salt), cur.hash);
  else {
    const boot = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
    ok = !!boot && same(password, boot);
    setup = ok;
  }
  if (!ok) {
    if (await tooManyFailures(visitor)) throw new AdminLocked();
    return null;
  }
  return { token: signToken({ k: "admin", pv: versionOf(cur) } satisfies AdminToken, setup ? 3600_000 : 12 * 3600_000), setup };
}

/** Sets the password. Once one exists, the current one is required to change it. */
export async function setAdminPassword(next: string, current?: string): Promise<void> {
  if (next.length < 8) throw Object.assign(new Error("The password needs at least 8 characters."), { status: 400 });
  const cur = await stored();
  if (cur?.hash && !(current && same(hashOf(current, cur.salt), cur.hash))) throw Object.assign(new Error("The current password is wrong."), { status: 403 });
  const salt = randomBytes(16).toString("hex");
  await setSetting("admin_password", { salt, hash: hashOf(next, salt) });
}

/**
 * Admin token from /api/admin/login, valid only for the current password. `scripts: true` also
 * accepts ADMIN_SECRET / CRON_SECRET as the bearer (store refresh from scripts) — never for
 * settings or the password.
 */
export async function isAdmin(req: Request, opts: { scripts?: boolean } = {}): Promise<boolean> {
  const h = req.headers.get("authorization") ?? "";
  const tok = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!tok) return false;
  if (opts.scripts) {
    const boot = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
    if (boot && same(tok, boot)) return true;
  }
  const t = verifyToken<AdminToken>(tok);
  if (t?.k !== "admin" || !t.pv) return false;
  return t.pv === versionOf(await stored());
}

export async function requireAdmin(req: Request, opts: { scripts?: boolean } = {}): Promise<Response | null> {
  return (await isAdmin(req, opts)) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
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
    allRows<{ amount: number | string }>((from, to) => db.from("payments").select("amount").eq("status", "completed").order("payment_id").range(from, to)),
  ]);
  const amounts = pays.map((p) => Number(p.amount) || 0);
  return { users, newUsers7, activePacks, paymentsCompleted: amounts.length, revenuePi: Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100, orders30, merchantsPending };
}
