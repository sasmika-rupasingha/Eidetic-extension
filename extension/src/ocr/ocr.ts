/**
 * Text recognition with Tesseract, running locally in a Web Worker (WebAssembly). Nothing is uploaded.
 * English ships with the extension; other languages are data files fetched once from jsDelivr and kept in Cache Storage.
 */
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { ocrScale, dataUrlToBlob } from '../shared/image';
import type { OcrLine } from '../detect/table';

export interface OcrResult {
  text: string;
  confidence: number;
  lines: OcrLine[];
  width: number;
  height: number;
  langs: string[];
}

export type OcrProgress = (status: string, fraction: number) => void;

// Downloaded languages are stored where Tesseract's worker looks first (idb-keyval's default store, key
// "./<code>.traineddata"), so the worker loads them from this browser instead of the network.
const cacheKey = (code: string) => `./${code}.traineddata`;
const cdnUrl = (code: string) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`;

export async function isLanguageReady(code: string): Promise<boolean> {
  if (code === 'eng') return true;
  return (await idbGet(cacheKey(code))) !== undefined;
}

/** Downloads a language (a few MB) and keeps it for offline use. */
export async function downloadLanguage(code: string, onProgress?: (fraction: number) => void): Promise<void> {
  if (code === 'eng') return;
  if (!/^[a-z_]{3,10}$/.test(code)) throw new Error('Unknown language.');
  const res = await fetch(cdnUrl(code));
  if (!res.ok || !res.body) throw new Error(`Couldn’t download ${code} (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress?.(got / total);
  }
  const data = new Uint8Array(got);
  let at = 0;
  for (const p of parts) {
    data.set(p, at);
    at += p.length;
  }
  if (data[0] !== 0x1f || data[1] !== 0x8b) throw new Error('The downloaded language file looks damaged. Try again.');
  await idbSet(cacheKey(code), data);
}

export async function removeLanguage(code: string): Promise<void> {
  if (code === 'eng') return;
  await idbDel(cacheKey(code));
  if (workerKey.split('+').includes(code)) await resetWorker();
}

let worker: Worker | null = null;
let workerKey = '';
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let progress: OcrProgress | undefined;

async function resetWorker() {
  const w = worker;
  worker = null;
  workerKey = '';
  await w?.terminate().catch(() => undefined);
}

async function getWorker(langs: string[]): Promise<Worker> {
  const key = langs.join('+');
  if (worker && workerKey === key) return worker;
  await resetWorker();
  for (const code of langs) if (!(await isLanguageReady(code))) await downloadLanguage(code);
  let failure: unknown = null;
  const start = createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: chrome.runtime.getURL('ocr/worker.min.js'),
    corePath: chrome.runtime.getURL('ocr/core'),
    langPath: chrome.runtime.getURL('ocr/lang'), // English ships here; other languages come from the cache above
    workerBlobURL: false,
    cacheMethod: 'readOnly',
    logger: (m) => progress?.(m.status, m.progress),
    errorHandler: (e) => (failure = e),
  });
  // If the engine fails to start, tesseract.js may never settle the promise: give up after a minute.
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(failure ? `Text recognition couldn’t start: ${String(failure)}` : 'Text recognition took too long to start. Try again.')), 60_000));
  worker = await Promise.race([start, timeout]);
  workerKey = key;
  return worker;
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void resetWorker(), 120_000);
}

/** Flattens onto white (transparent PNGs read as black otherwise) and scales small images up (~2x reads far better). */
async function prepare(image: string): Promise<{ blob: Blob; scale: number; width: number; height: number }> {
  const bmp = await createImageBitmap(await dataUrlToBlob(image));
  const { width, height } = bmp;
  const scale = ocrScale(width, height);
  const c = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return { blob: await c.convertToBlob({ type: 'image/png' }), scale, width, height };
}

type Bbox = { x0: number; y0: number; x1: number; y1: number };
const scaleBox = (b: Bbox, s: number) => ({ x0: b.x0 / s, y0: b.y0 / s, x1: b.x1 / s, y1: b.y1 / s });

/** Tidies Tesseract's text: no trailing spaces, at most one blank line between paragraphs. */
export function tidyText(t: string): string {
  return t
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/­/g, '')
    .trim();
}

let queue: Promise<unknown> = Promise.resolve();

/** Recognises text in an image (data URL). Calls are queued, so the panel and Smart Find can share one worker. */
export function recognize(image: string, langs: string[] = ['eng'], onProgress?: OcrProgress, mode: 'auto' | 'sparse' = 'auto'): Promise<OcrResult> {
  const run = async (): Promise<OcrResult> => {
    clearTimeout(idleTimer);
    progress = onProgress;
    try {
      const w = await getWorker(langs.length ? langs : ['eng']);
      const prep = await prepare(image);
      await w.setParameters({ tessedit_pageseg_mode: mode === 'sparse' ? PSM.SPARSE_TEXT : PSM.AUTO, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      const { data } = await w.recognize(prep.blob, {}, { text: true, blocks: true });
      const lines: OcrLine[] = [];
      for (const b of data.blocks ?? []) {
        for (const p of b.paragraphs) {
          for (const l of p.lines) {
            const words = l.words.filter((wd) => wd.text.trim() && wd.confidence > 20).map((wd) => ({ text: wd.text, bbox: scaleBox(wd.bbox, prep.scale) }));
            if (words.length) lines.push({ text: l.text.trim(), bbox: scaleBox(l.bbox, prep.scale), words });
          }
        }
      }
      return { text: tidyText(data.text ?? ''), confidence: Math.round(data.confidence ?? 0), lines, width: prep.width, height: prep.height, langs };
    } catch (e) {
      await resetWorker(); // start fresh next time
      throw e instanceof Error ? e : new Error(String(e));
    } finally {
      progress = undefined;
      scheduleIdle();
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
