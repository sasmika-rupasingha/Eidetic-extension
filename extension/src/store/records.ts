/** The small record stores (workspaces, notebooks, monitors) in the same IndexedDB as the captures. */
import { done, openDb, request, type RecordStore } from './captures';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eidetic-records') : null;
const local = new Set<(store: RecordStore) => void>();

function notify(store: RecordStore): void {
  channel?.postMessage({ store });
  for (const fn of Array.from(local)) fn(store);
}

export function onRecordsChanged(cb: (store: RecordStore) => void): () => void {
  const fn = (e: MessageEvent<{ store: RecordStore }>) => cb(e.data.store);
  channel?.addEventListener('message', fn);
  local.add(cb);
  return () => {
    channel?.removeEventListener('message', fn);
    local.delete(cb);
  };
}

export async function listRecords<T>(store: RecordStore): Promise<T[]> {
  const db = await openDb();
  return (await request(db.transaction(store).objectStore(store).getAll())) as T[];
}

export async function getRecord<T>(store: RecordStore, id: string): Promise<T | undefined> {
  const db = await openDb();
  return (await request(db.transaction(store).objectStore(store).get(id))) as T | undefined;
}

export async function putRecord<T extends { id: string }>(store: RecordStore, rec: T): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(rec);
  await done(tx);
  notify(store);
  return rec;
}

/** Changes one record inside a transaction; returns undefined if it doesn't exist. */
export async function updateRecord<T extends { id: string }>(store: RecordStore, id: string, change: (r: T) => T | void): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  const cur = (await request(os.get(id))) as T | undefined;
  if (!cur) return undefined;
  const draft = structuredClone(cur);
  const next = change(draft) ?? draft;
  os.put(next);
  await done(tx);
  notify(store);
  return next;
}

export async function deleteRecord(store: RecordStore, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await done(tx);
  notify(store);
}
