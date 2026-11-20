/**
 * The capture library in IndexedDB (database "eidetic"): capture records, their images, and a counter for the
 * catalogue number (№ 0148). Works from extension pages and from the background service worker.
 *
 * Fields for later releases (workspace, relations, embedding, hash) exist from version 1, so v2/v3 need no migration.
 */
import type { Detection } from '../detect/classify';
import type { OcrLine } from '../detect/table';
import type { PrivacyFinding } from '../privacy/detect';

export interface VideoMoment {
  /** Seconds into the video. */
  time: number;
  duration?: number;
  title: string;
  /** The page the video is on. */
  url: string;
  /** A link that opens the video at this moment, when the site supports it (YouTube, direct video files). */
  resumeUrl?: string;
}

export interface SavedAnswer {
  task: string;
  label: string;
  text: string;
  model: string;
  local: boolean;
  at: number;
}

export interface Capture {
  id: string;
  number: number;
  createdAt: number;
  status: 'temporary' | 'kept';
  pinned: boolean;
  source: { url: string; title: string; site: string };
  video?: VideoMoment;
  image: { blobId: string; w: number; h: number; bytes: number; mime: string; thumb: string };
  /** The panel showed the whole screen because the page refused the on-page selector (PDF viewer, protected pages). */
  needsCrop?: boolean;
  processing: 'new' | 'reading' | 'done' | 'error';
  error?: string;
  ocr?: { text: string; langs: string[]; confidence: number; lines: OcrLine[] };
  qr?: string | null;
  detection?: Detection;
  privacy?: { findings: PrivacyFinding[] };
  notes: string;
  ai: { description?: string; keywords?: string[]; topics?: string[]; model?: string; local?: boolean; at?: number };
  answers: SavedAnswer[];
  // Later releases
  workspaceId?: string;
  relations: Array<{ id: string; reason: string; by: 'rules' | 'ai' | 'user'; removed?: boolean }>;
  hash?: string;
}

const DB_NAME = 'eidetic';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('captures')) db.createObjectStore('captures', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Couldn’t open the library.'));
    };
  });
  return dbPromise;
}

/** For tests: close and forget the open connection. */
export async function resetDbForTests(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p.catch(() => null))?.close();
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Library write failed.'));
    tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('Storage is full. Remove some captures in Settings › Storage.') : (tx.error ?? new Error('Library write was cancelled.')));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const newId = () => `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '')}`;

export function siteOf(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') return 'Eidetic';
    if (u.protocol === 'file:') return 'File';
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Saves a new capture with its image. Returns the stored record (with its catalogue number). */
export async function addCapture(input: { image: Blob; w: number; h: number; thumb: string; source: Capture['source']; video?: VideoMoment; needsCrop?: boolean }): Promise<Capture> {
  const db = await openDb();
  const tx = db.transaction(['captures', 'blobs', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  const last = ((await request(meta.get('lastNumber'))) as number | undefined) ?? 0;
  const id = newId();
  const blobId = `img-${id}`;
  const cap: Capture = {
    id,
    number: last + 1,
    createdAt: Date.now(),
    status: 'temporary',
    pinned: false,
    source: input.source,
    ...(input.video ? { video: input.video } : {}),
    image: { blobId, w: input.w, h: input.h, bytes: input.image.size, mime: input.image.type || 'image/png', thumb: input.thumb },
    ...(input.needsCrop ? { needsCrop: true } : {}),
    processing: 'new',
    notes: '',
    ai: {},
    answers: [],
    relations: [],
  };
  meta.put(cap.number, 'lastNumber');
  tx.objectStore('blobs').put(input.image, blobId);
  tx.objectStore('captures').put(cap);
  await done(tx);
  notifyChanged(id);
  return cap;
}

export async function getCapture(id: string): Promise<Capture | undefined> {
  const db = await openDb();
  return request(db.transaction('captures').objectStore('captures').get(id)) as Promise<Capture | undefined>;
}

export async function getImage(blobId: string): Promise<Blob | undefined> {
  const db = await openDb();
  return request(db.transaction('blobs').objectStore('blobs').get(blobId)) as Promise<Blob | undefined>;
}

/** Replaces a capture's image (after cropping in the panel or redacting). */
export async function replaceImage(id: string, image: Blob, w: number, h: number, thumb: string): Promise<Capture | undefined> {
  const db = await openDb();
  const tx = db.transaction(['captures', 'blobs'], 'readwrite');
  const cap = (await request(tx.objectStore('captures').get(id))) as Capture | undefined;
  if (!cap) {
    tx.abort();
    return undefined;
  }
  tx.objectStore('blobs').put(image, cap.image.blobId);
  const next: Capture = { ...cap, needsCrop: false, image: { ...cap.image, w, h, bytes: image.size, mime: image.type || 'image/png', thumb } };
  tx.objectStore('captures').put(next);
  await done(tx);
  notifyChanged(id);
  return next;
}

/** Applies a change to a capture inside one transaction, so concurrent updates don't overwrite each other. */
export async function updateCapture(id: string, change: (c: Capture) => Capture | void): Promise<Capture | undefined> {
  const db = await openDb();
  const tx = db.transaction('captures', 'readwrite');
  const store = tx.objectStore('captures');
  const cur = (await request(store.get(id))) as Capture | undefined;
  if (!cur) return undefined;
  const draft = structuredClone(cur);
  const next = change(draft) ?? draft;
  store.put(next);
  await done(tx);
  notifyChanged(id);
  return next;
}

export async function listCaptures(): Promise<Capture[]> {
  const db = await openDb();
  const all = (await request(db.transaction('captures').objectStore('captures').getAll())) as Capture[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCaptures(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction(['captures', 'blobs'], 'readwrite');
  const caps = tx.objectStore('captures');
  for (const id of ids) {
    const c = (await request(caps.get(id))) as Capture | undefined;
    if (c) tx.objectStore('blobs').delete(c.image.blobId);
    caps.delete(id);
  }
  await done(tx);
  notifyChanged();
}

/** Temporary captures older than `days` that the user never kept, pinned, annotated or acted on. */
export function expiredIds(caps: Capture[], days: number, now = Date.now()): string[] {
  if (days <= 0) return [];
  const limit = now - days * 86_400_000;
  return caps.filter((c) => c.status === 'temporary' && !c.pinned && !c.notes.trim() && !c.answers.length && c.createdAt < limit).map((c) => c.id);
}

export async function expireTemporary(days: number): Promise<number> {
  const ids = expiredIds(await listCaptures(), days);
  await deleteCaptures(ids);
  return ids.length;
}

export interface Usage {
  count: number;
  kept: number;
  temporary: number;
  imageBytes: number;
  quota?: number;
  used?: number;
}

export async function usage(): Promise<Usage> {
  const caps = await listCaptures();
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  return {
    count: caps.length,
    kept: caps.filter((c) => c.status === 'kept' || c.pinned).length,
    temporary: caps.filter((c) => c.status === 'temporary' && !c.pinned).length,
    imageBytes: caps.reduce((s, c) => s + c.image.bytes, 0),
    ...(est?.quota ? { quota: est.quota, used: est.usage } : {}),
  };
}

/* Change notifications: other pages hear them through a BroadcastChannel (which never echoes to the page that sent
   them), and listeners in this page are called directly. */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eidetic-captures') : null;
const local = new Set<(id: string | null) => void>();

export function notifyChanged(id?: string): void {
  channel?.postMessage({ id: id ?? null });
  for (const fn of Array.from(local)) fn(id ?? null);
}

export function onCapturesChanged(cb: (id: string | null) => void): () => void {
  const fn = (e: MessageEvent<{ id: string | null }>) => cb(e.data.id);
  channel?.addEventListener('message', fn);
  local.add(cb);
  return () => {
    channel?.removeEventListener('message', fn);
    local.delete(cb);
  };
}

/** "Mark as kept": the user cares about this capture, so it is never removed automatically. */
export const keep = (id: string) => updateCapture(id, (c) => void (c.status = 'kept'));

export const formatNumber = (n: number) => `№ ${String(n).padStart(4, '0')}`;
