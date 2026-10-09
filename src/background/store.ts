/**
 * Payload store backed by IndexedDB in the service worker. Payloads can be
 * larger than chrome.storage.session allows (diagrams with embedded images),
 * and must survive service worker restarts so a viewer tab can be reloaded.
 */
import type { Payload } from "../shared/protocol";

const DB_NAME = "excalidraw-github-preview";
const STORE = "payloads";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

interface Entry {
  id: string;
  created: number;
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

export async function putPayload(payload: Payload): Promise<string> {
  const db = await openDb();
  const id = crypto.randomUUID();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ id, created: Date.now(), payload } satisfies Entry);
  await done(tx);
  void prune().catch(() => undefined);
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

/** Drop entries older than a week and keep at most MAX_ENTRIES. */
async function prune(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const keysReq = store.index("created").getAllKeys();
  keysReq.onsuccess = () => {
    // Index keys come back oldest first; getAllKeys on an index yields primary keys.
    const ids = keysReq.result;
    const excess = Math.max(0, ids.length - MAX_ENTRIES);
    ids.slice(0, excess).forEach((id) => store.delete(id));
    const cutoff = Date.now() - MAX_AGE_MS;
    const oldReq = store.index("created").getAllKeys(IDBKeyRange.upperBound(cutoff));
    oldReq.onsuccess = () => oldReq.result.forEach((id) => store.delete(id));
  };
  await done(tx);
}
