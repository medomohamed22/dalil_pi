"use client";

import Dexie, { type Table } from "dexie";
import {
  DEFAULT_SETTINGS,
  type ChatMessage,
  type Conversation,
  type Settings,
} from "./types";

/**
 * The app runs English-only, US-only, on the server's Meta key with one fixed
 * model — only the spending mandate is the user's to change.
 */
const LOCKED = {
  apiKey: "",
  baseUrl: DEFAULT_SETTINGS.baseUrl,
  model: DEFAULT_SETTINGS.model,
  reasoningEffort: DEFAULT_SETTINGS.reasoningEffort,
  market: "US",
  city: "New York",
  lang: "en",
  demoMode: false,
} as const satisfies Partial<Settings>;

interface KV {
  key: string;
  value: unknown;
}

/**
 * Everything the user owns lives in the browser's IndexedDB (large quota,
 * handles images), never on our server. Only price watches are mirrored
 * server-side because they must run while the tab is closed.
 */
class DalilDB extends Dexie {
  conversations!: Table<Conversation, string>;
  messages!: Table<ChatMessage, string>;
  kv!: Table<KV, string>;

  constructor() {
    super("dalil");
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
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}), ...LOCKED };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await db().kv.put({ key: "settings", value: { ...s, ...LOCKED } });
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  try {
    return (await db().kv.get(key))?.value as T | undefined;
  } catch {
    return undefined;
  }
}

export async function setKV(key: string, value: unknown): Promise<void> {
  await db().kv.put({ key, value });
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
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
