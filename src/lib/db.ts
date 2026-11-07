"use client";

import Dexie, { type Table } from "dexie";
import { DEFAULT_SETTINGS, type ChatMessage, type Conversation, type Settings } from "./types";

interface KV {
  key: string;
  value: unknown;
}

/**
 * Chats, photos and settings stay in the browser's IndexedDB. The server
 * (Supabase) only keeps the Pi account, its preferences and monthly usage.
 */
class DalilDB extends Dexie {
  conversations!: Table<Conversation, string>;
  messages!: Table<ChatMessage, string>;
  kv!: Table<KV, string>;

  constructor() {
    super("dalil-pi");
    this.version(1).stores({
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt, [conversationId+createdAt]",
      kv: "key",
    });
  }
}

let _db: DalilDB | null = null;
export function db(): DalilDB {
  if (!_db) _db = new DalilDB();
  return _db;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const row = await db().kv.get("settings");
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await db().kv.put({ key: "settings", value: s });
  } catch {
    /* private mode — settings live only for this visit */
  }
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  try {
    return (await db().kv.get(key))?.value as T | undefined;
  } catch {
    return undefined;
  }
}

export async function setKV(key: string, value: unknown): Promise<void> {
  try {
    await db().kv.put({ key, value });
  } catch {
    /* ignore */
  }
}

export async function delKV(key: string): Promise<void> {
  try {
    await db().kv.delete(key);
  } catch {
    /* ignore */
  }
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
