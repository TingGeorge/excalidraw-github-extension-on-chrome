/**
 * Payload store backed by IndexedDB in the service worker. Payloads can be
 * larger than chrome.storage.session allows (diagrams with embedded images),
 * and must survive service worker restarts so a viewer tab can be reloaded.
 * Old entries are pruned by age, count and total size.
 */
import type { Payload } from "../shared/protocol";

const DB_NAME = "excalidraw-github-preview";
const STORE = "payloads";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 60;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

interface Entry {
  id: string;
  created: number;
  /** Approximate size in bytes (string lengths). */
  size: number;
  payload: Payload;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("created", "created");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Could not open IndexedDB"));
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function payloadSize(payload: Payload): number {
  if (payload.mode === "view") return payload.content.data.length;
  return (payload.base.content?.data.length ?? 0) + (payload.head.content?.data.length ?? 0);
}

export async function putPayload(payload: Payload): Promise<string> {
  const db = await openDb();
  const id = crypto.randomUUID();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ id, created: Date.now(), size: payloadSize(payload), payload } satisfies Entry);
  await done(tx);
  void prune(id).catch(() => undefined);
  return id;
}

export async function getPayload(id: string): Promise<Payload | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).get(id);
  await done(tx);
  const entry = req.result as Entry | undefined;
  return entry?.payload ?? null;
}

/** Keep the newest entries within the age, count and size budgets (never the one just added). */
async function prune(keep: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const cutoff = Date.now() - MAX_AGE_MS;
  let count = 0;
  let total = 0;
  // Newest first.
  const cursorReq = tx.objectStore(STORE).index("created").openCursor(null, "prev");
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (!cursor) return;
    const entry = cursor.value as Entry;
    count++;
    total += entry.size ?? payloadSize(entry.payload);
    const overBudget = count > MAX_ENTRIES || total > MAX_TOTAL_BYTES || entry.created < cutoff;
    if (overBudget && entry.id !== keep) cursor.delete();
    cursor.continue();
  };
  await done(tx);
}
