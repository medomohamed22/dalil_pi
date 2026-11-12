"use client";

import type { Dexie, Table } from "dexie";
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type ChatMessage, type Conversation, type Settings } from "./types";

interface KV {
  key: string;
  value: unknown;
}

/**
 * Chats, photos and settings stay in the browser's IndexedDB. The server
 * (Supabase) only keeps the Pi account, its preferences and monthly usage.
 * Dexie (~90 KB) is loaded on first use, not with the first page.
 */
type DalilDB = Dexie & {
  conversations: Table<Conversation, string>;
  messages: Table<ChatMessage, string>;
  kv: Table<KV, string>;
};

let _db: Promise<DalilDB> | null = null;
export function getDb(): Promise<DalilDB> {
  return (_db ??= import("dexie").then(({ default: DexieCtor }) => {
    const d = new DexieCtor("dalil-pi") as DalilDB;
    d.version(1).stores({
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt, [conversationId+createdAt]",
      kv: "key",
    });
    return d;
  }));
}

/** Live query (re-runs when the tables change, in any tab) — useLiveQuery without loading Dexie up front. */
export function useDbQuery<T>(query: (d: DalilDB) => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let dead = false;
    let sub: { unsubscribe(): void } | undefined;
    void (async () => {
      try {
        const [d, { liveQuery }] = await Promise.all([getDb(), import("dexie")]);
        if (dead) return;
        sub = liveQuery(() => query(d)).subscribe({ next: (v) => !dead && setValue(v), error: () => {} });
      } catch {
        /* private mode: no stored chats */
      }
    })();
    return () => {
      dead = true;
      sub?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const row = await (await getDb()).kv.get("settings");
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await (await getDb()).kv.put({ key: "settings", value: s });
  } catch {
    /* private mode — settings live only for this visit */
  }
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  try {
    return (await (await getDb()).kv.get(key))?.value as T | undefined;
  } catch {
    return undefined;
  }
}

export async function setKV(key: string, value: unknown): Promise<void> {
  try {
    await (await getDb()).kv.put({ key, value });
  } catch {
    /* ignore */
  }
}

export async function delKV(key: string): Promise<void> {
  try {
    await (await getDb()).kv.delete(key);
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
