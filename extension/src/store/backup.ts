/**
 * Full backup and import (v3): one `.eidetic.json` file with every capture (image as base64), notes, answers,
 * relations, workspaces, notebooks, monitors and settings — never API keys. Import validates everything as untrusted
 * input, re-derives what can be re-derived (detection, privacy findings), and merges without duplicates.
 */
import { classify } from '../detect/classify';
import type { OcrLine } from '../detect/table';
import { validateMonitor, type Monitor } from '../monitor/monitor';
import { findSensitive } from '../privacy/detect';
import { blobToDataUrl } from '../shared/image';
import { validateNotebook, type Notebook } from '../study/notebook';
import { done, getImage, listCaptures, notifyChanged, openDb, request, type Capture } from './captures';
import { listRecords, putRecord } from './records';
import { loadSettings, OCR_LANGUAGES, PROVIDER_IDS, saveSettings, validateSettings, type Settings } from './settings';
import { validateWorkspace, type Workspace } from './workspaces';

export const BACKUP_FORMAT = 'eidetic-backup';
export const BACKUP_VERSION = 1;
const MAX_IMAGE_CHARS = 40_000_000; // ~30 MB per image

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : null);
const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const idOf = (v: unknown) => (typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v) ? v : null);
const webUrl = (v: unknown) => {
  const s = str(v, 4000);
  try {
    return s && /^https?:$/.test(new URL(s).protocol) ? s : '';
  } catch {
    return '';
  }
};

/** Settings without any API key. */
export function stripSecrets(s: Settings): Settings {
  const out = structuredClone(s);
  for (const id of PROVIDER_IDS) out.providers[id].apiKey = '';
  return out;
}

const MIMES: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

/** Decodes a base64 image and checks it really is the image type it claims (PNG, JPEG or WebP). */
export function decodeImage(data: unknown, mime: unknown): { bytes: Uint8Array; mime: string } | null {
  if (typeof data !== 'string' || typeof mime !== 'string' || !MIMES[mime] || !data || data.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  let bin: string;
  try {
    bin = atob(data);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.length >= 12 && MIMES[mime]!(bytes) ? { bytes, mime } : null;
}

const box = (v: unknown) => {
  const b = obj(v);
  return b && fin(b.x0) && fin(b.y0) && fin(b.x1) && fin(b.y1) ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : null;
};

function lines(v: unknown): OcrLine[] {
  if (!Array.isArray(v)) return [];
  const out: OcrLine[] = [];
  for (const l of v.slice(0, 5000)) {
    const o = obj(l);
    const b = box(o?.bbox);
    if (!o || !b || typeof o.text !== 'string') continue;
    const words = (Array.isArray(o.words) ? o.words : [])
      .slice(0, 400)
      .map((w) => {
        const wo = obj(w);
        const wb = box(wo?.bbox);
        return wo && wb && typeof wo.text === 'string' ? { text: wo.text.slice(0, 200), bbox: wb } : null;
      })
      .filter((w): w is NonNullable<typeof w> => Boolean(w));
    out.push({ text: o.text.slice(0, 2000), bbox: b, words });
  }
  return out;
}

const strings = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, max)).slice(0, n) : []);

/**
 * A capture from a backup, cleaned. Detection and privacy findings are worked out again from the text (they are
 * never trusted from the file). Returns null when the record isn't usable.
 */
export function validateCapture(raw: unknown): Omit<Capture, 'image'> & { image: Omit<Capture['image'], 'bytes'> & { bytes: number } } | null {
  const r = obj(raw);
  const id = idOf(r?.id);
  if (!r || !id) return null;
  const img = obj(r.image);
  const w = img?.w;
  const h = img?.h;
  if (!img || !fin(w) || !fin(h) || w < 1 || h < 1 || w > 30000 || h > 30000) return null;
  const thumb = str(img.thumb, 400_000);
  const src = obj(r.source) ?? {};
  const source = { url: webUrl(src.url), title: str(src.title, 500), site: str(src.site, 200) };
  const o = obj(r.ocr);
  const text = o ? str(o.text, 200_000) : '';
  const ocrLines = o ? lines(o.lines) : [];
  const qr = typeof r.qr === 'string' ? r.qr.slice(0, 4000) : null;
  const ocr = o ? { text, langs: strings(o.langs, 4, 20).filter((l) => l in OCR_LANGUAGES), confidence: fin(o.confidence) ? Math.max(0, Math.min(100, o.confidence)) : 0, lines: ocrLines } : undefined;
  const v = obj(r.video);
  const video = v && fin(v.time) ? { time: Math.max(0, v.time), ...(fin(v.duration) ? { duration: v.duration } : {}), title: str(v.title, 500), url: webUrl(v.url), ...(webUrl(v.resumeUrl) ? { resumeUrl: webUrl(v.resumeUrl) } : {}) } : undefined;
  const ai = obj(r.ai) ?? {};
  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .slice(0, 200)
    .map((a) => obj(a))
    .filter((a): a is Loose => Boolean(a) && typeof a!.text === 'string')
    .map((a) => ({ task: str(a.task, 40), label: str(a.label, 100), text: str(a.text, 60_000), model: str(a.model, 200), local: Boolean(a.local), at: fin(a.at) ? a.at : 0 }));
  const relations = (Array.isArray(r.relations) ? r.relations : [])
    .slice(0, 50)
    .map((x) => obj(x))
    .filter((x): x is Loose => Boolean(x) && Boolean(idOf(x!.id)))
    .map((x) => ({ id: x.id as string, reason: str(x.reason, 200), by: (['rules', 'ai', 'user'] as const).find((b) => b === x.by) ?? 'rules', ...(x.removed === true ? { removed: true } : {}) }));
  const area = obj(r.area);
  const ar = obj(area?.rect);
  const vp = obj(area?.viewport);
  const emb = obj(r.embedding);
  const vector = Array.isArray(emb?.vector) && emb.vector.length <= 8192 && emb.vector.every(fin) ? (emb.vector as number[]) : null;
  const ocrLangs = strings(r.ocrLangs, 4, 20).filter((l) => l in OCR_LANGUAGES);
  return {
    id,
    number: fin(r.number) && r.number >= 1 ? Math.floor(r.number) : 0,
    createdAt: fin(r.createdAt) ? r.createdAt : Date.now(),
    status: r.status === 'kept' ? 'kept' : 'temporary',
    pinned: r.pinned === true,
    source,
    ...(video ? { video } : {}),
    image: { blobId: `img-${id}`, w: Math.round(w), h: Math.round(h), bytes: 0, mime: 'image/png', thumb: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(thumb) ? thumb : '' },
    processing: ocr ? 'done' : 'new',
    ...(ocr ? { ocr, detection: classify({ text, lines: ocrLines, qr, source: { title: source.title, site: source.site } }), privacy: { findings: findSensitive(text, ocrLines) }, qr } : {}),
    ...(ocrLangs.length ? { ocrLangs } : {}),
    notes: str(r.notes, 4000),
    ai: {
      ...(typeof ai.description === 'string' && ai.description.trim() ? { description: ai.description.slice(0, 160) } : {}),
      ...(Array.isArray(ai.keywords) ? { keywords: strings(ai.keywords, 6, 40) } : {}),
      ...(Array.isArray(ai.topics) ? { topics: strings(ai.topics, 3, 40) } : {}),
      ...(typeof ai.model === 'string' ? { model: ai.model.slice(0, 200) } : {}),
      ...(typeof ai.local === 'boolean' ? { local: ai.local } : {}),
      ...(fin(ai.at) ? { at: ai.at } : {}),
    },
    answers,
    ...(idOf(r.workspaceId) ? { workspaceId: r.workspaceId as string } : {}),
    relations,
    ...(typeof r.hash === 'string' && /^[0-9a-f]{16}$/.test(r.hash) ? { hash: r.hash } : {}),
    ...(ar && vp && fin(ar.x) && fin(ar.y) && fin(ar.w) && fin(ar.h) && fin(vp.w) && fin(vp.h) ? { area: { rect: { x: ar.x, y: ar.y, w: ar.w, h: ar.h }, viewport: { w: vp.w, h: vp.h } } } : {}),
    ...(idOf(r.compareTo) ? { compareTo: r.compareTo as string } : {}),
    ...(emb && vector && typeof emb.model === 'string' && /^(ollama|lmstudio):.+/.test(emb.model) ? { embedding: { model: emb.model.slice(0, 240), vector, at: fin(emb.at) ? emb.at : 0 } } : {}),
  };
}

export interface ParsedBackup {
  captures: Array<{ capture: Capture; image: Blob }>;
  workspaces: Workspace[];
  notebooks: Notebook[];
  monitors: Monitor[];
  settings: Settings | null;
  /** Records that were dropped because they weren't valid. */
  invalid: number;
  exportedAt: string;
}

/** Reads a backup file's text. Throws a clear error when it isn't an Eidetic backup. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t a valid backup (not JSON).');
  }
  const r = obj(raw);
  if (!r || r.format !== BACKUP_FORMAT) throw new Error('This file isn’t an Eidetic backup.');
  if (!fin(r.version) || r.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of Eidetic. Update Eidetic, then import it.');
  let invalid = 0;
  const list = <T,>(v: unknown, fn: (x: unknown) => T | null, max: number): T[] => {
    const arr = Array.isArray(v) ? v.slice(0, max) : [];
    const out: T[] = [];
    for (const x of arr) {
      const ok = fn(x);
      if (ok) out.push(ok);
      else invalid += 1;
    }
    return out;
  };
  const captures = list(
    r.captures,
    (x) => {
      const c = validateCapture(x);
      const o = obj(x);
      const img = decodeImage(o?.imageData, o?.imageMime);
      if (!c || !img) return null;
      const blob = new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: img.mime });
      return { capture: { ...c, image: { ...c.image, mime: img.mime, bytes: blob.size } } as Capture, image: blob };
    },
    100_000,
  );
  const settingsRaw = obj(r.settings);
  return {
    captures,
    workspaces: list(r.workspaces, validateWorkspace, 10_000),
    notebooks: list(r.notebooks, validateNotebook, 10_000),
    monitors: list(r.monitors, validateMonitor, 10_000),
    settings: settingsRaw ? stripSecrets(validateSettings(settingsRaw)) : null,
    invalid,
    exportedAt: str(r.exportedAt, 40),
  };
}

/** Builds the backup file. API keys are never included. */
export async function exportBackup(appVersion: string): Promise<{ blob: Blob; counts: { captures: number; workspaces: number; notebooks: number; monitors: number } }> {
  const caps = await listCaptures();
  const parts: string[] = [];
  for (const c of caps) {
    const img = await getImage(c.image.blobId);
    if (!img) continue;
    const url = await blobToDataUrl(img);
    parts.push(JSON.stringify({ ...c, imageMime: img.type || c.image.mime, imageData: url.slice(url.indexOf(',') + 1) }));
  }
  const [workspaces, notebooks, monitors, settings] = await Promise.all([listRecords('workspaces'), listRecords('notebooks'), listRecords('monitors'), loadSettings()]);
  const head = { app: 'Eidetic', format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion, exportedAt: new Date().toISOString(), note: 'API keys are not included.', settings: stripSecrets(settings), workspaces, notebooks, monitors };
  const json = `${JSON.stringify(head).slice(0, -1)},"captures":[${parts.join(',')}]}`;
  return { blob: new Blob([json], { type: 'application/json' }), counts: { captures: parts.length, workspaces: workspaces.length, notebooks: notebooks.length, monitors: monitors.length } };
}

export interface ImportReport {
  added: { captures: number; workspaces: number; notebooks: number; monitors: number };
  skipped: { captures: number; workspaces: number; notebooks: number; monitors: number };
  invalid: number;
  settings: boolean;
}

/**
 * Merges a parsed backup into the library. A capture is skipped when its id exists, or when a capture already in the
 * library has the same image (same perceptual hash and size; copies inside the backup itself are all restored); other records are skipped when their id exists. Catalogue numbers
 * are kept unless taken. API keys are never imported: restoring settings keeps the keys already on this computer.
 */
export async function importBackup(b: ParsedBackup, opts: { restoreSettings?: boolean } = {}): Promise<ImportReport> {
  const report: ImportReport = { added: { captures: 0, workspaces: 0, notebooks: 0, monitors: 0 }, skipped: { captures: 0, workspaces: 0, notebooks: 0, monitors: 0 }, invalid: b.invalid, settings: false };
  for (const [store, items] of [
    ['workspaces', b.workspaces],
    ['notebooks', b.notebooks],
    ['monitors', b.monitors],
  ] as const) {
    const have = new Set((await listRecords<{ id: string }>(store)).map((x) => x.id));
    for (const it of items) {
      if (have.has(it.id)) report.skipped[store] += 1;
      else {
        await putRecord(store, it);
        report.added[store] += 1;
      }
    }
  }
  const existing = await listCaptures();
  const ids = new Set(existing.map((c) => c.id));
  const same = new Set(existing.filter((c) => c.hash).map((c) => `${c.hash}:${c.image.bytes}`));
  const numbers = new Set(existing.map((c) => c.number));
  const workspaceIds = new Set((await listRecords<{ id: string }>('workspaces')).map((w) => w.id));
  const db = await openDb();
  let last = ((await request(db.transaction('meta').objectStore('meta').get('lastNumber'))) as number | undefined) ?? 0;
  for (const { capture, image } of b.captures) {
    if (ids.has(capture.id) || (capture.hash && same.has(`${capture.hash}:${capture.image.bytes}`))) {
      report.skipped.captures += 1;
      continue;
    }
    const c: Capture = structuredClone(capture);
    if (!c.number || numbers.has(c.number)) c.number = Math.max(last, ...numbers, 0) + 1;
    if (c.workspaceId && !workspaceIds.has(c.workspaceId)) delete c.workspaceId;
    numbers.add(c.number);
    last = Math.max(last, c.number);
    const tx = db.transaction(['captures', 'blobs', 'meta'], 'readwrite');
    tx.objectStore('blobs').put(image, c.image.blobId);
    tx.objectStore('captures').put(c);
    tx.objectStore('meta').put(last, 'lastNumber');
    await done(tx);
    ids.add(c.id);
    report.added.captures += 1;
  }
  if (report.added.captures) notifyChanged();
  if (opts.restoreSettings && b.settings) {
    const cur = await loadSettings();
    const next = structuredClone(b.settings);
    for (const id of PROVIDER_IDS) next.providers[id].apiKey = cur.providers[id].apiKey;
    next.onboarded = cur.onboarded;
    await saveSettings(next);
    report.settings = true;
  }
  return report;
}

export function reportLine(r: ImportReport): string {
  const part = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const added = [part(r.added.captures, 'capture'), r.added.workspaces ? part(r.added.workspaces, 'workspace') : '', r.added.notebooks ? part(r.added.notebooks, 'notebook') : '', r.added.monitors ? part(r.added.monitors, 'watched page') : ''].filter(Boolean).join(', ');
  const skipped = r.skipped.captures + r.skipped.workspaces + r.skipped.notebooks + r.skipped.monitors;
  return `Added ${added}. ${skipped ? `Skipped ${skipped} already in your library. ` : ''}${r.invalid ? `Left out ${r.invalid} damaged or unsafe record${r.invalid === 1 ? '' : 's'}. ` : ''}${r.settings ? 'Settings restored (your API keys were kept).' : ''}`.trim();
}
