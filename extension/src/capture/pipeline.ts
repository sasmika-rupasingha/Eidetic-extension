/**
 * After a capture is saved: read the text (offline OCR) → QR code → detect the content → privacy scan → save.
 * Then, only if a model on this computer is ready, refine the description with AI. Captures are never sent to a cloud
 * model automatically; cloud AI runs only when the user presses an AI action.
 */
import { parseRefinement } from '../ai/prompts';
import { localOnly, readyMap, runAi, type Statuses } from '../ai/run';
import { classify } from '../detect/classify';
import { recognize, type OcrProgress } from '../ocr/ocr';
import { readQr } from '../ocr/qr';
import { findSensitive } from '../privacy/detect';
import { blobToDataUrl } from '../shared/image';
import { getCapture, getImage, updateCapture, type Capture } from '../store/captures';
import type { Settings } from '../store/settings';

const running = new Map<string, Promise<Capture | undefined>>();

export function processCapture(id: string, s: Settings, onProgress?: OcrProgress): Promise<Capture | undefined> {
  const existing = running.get(id);
  if (existing) return existing;
  const job = (async () => {
    const cap = await getCapture(id);
    if (!cap || cap.needsCrop) return cap;
    if (cap.processing === 'done') return cap;
    await updateCapture(id, (c) => void (c.processing = 'reading'));
    try {
      const blob = await getImage(cap.image.blobId);
      if (!blob) throw new Error('The image of this capture is missing.');
      const dataUrl = await blobToDataUrl(blob);
      const [ocr, qr] = await Promise.all([recognize(dataUrl, s.ocrLanguages, onProgress), readQr(dataUrl)]);
      const detection = classify({ text: ocr.text, lines: ocr.lines, qr, source: { title: cap.source.title, site: cap.source.site } });
      const findings = findSensitive(ocr.text, ocr.lines);
      return await updateCapture(id, (c) => {
        c.ocr = { text: ocr.text, langs: ocr.langs, confidence: ocr.confidence, lines: ocr.lines };
        c.qr = qr;
        c.detection = detection;
        c.privacy = { findings };
        c.processing = 'done';
        delete c.error;
      });
    } catch (e) {
      return updateCapture(id, (c) => {
        c.processing = 'error';
        c.error = (e as Error).message || 'Couldn’t read this capture.';
      });
    }
  })().finally(() => running.delete(id));
  running.set(id, job);
  return job;
}

/** Improves the description, keywords and topics with a model on this computer, if one is ready. Silent on failure. */
export async function refineLocally(id: string, s: Settings, statuses: Statuses): Promise<void> {
  const local = localOnly(s);
  if (!Object.keys(readyMap(statuses)).some((p) => p === 'builtin' || p === 'ollama' || p === 'lmstudio' || p === 'custom')) return;
  const cap = await getCapture(id);
  if (!cap?.detection || cap.ai.description || !cap.ocr?.text.trim()) return;
  try {
    const run = await runAi('refine', { text: cap.ocr.text, category: cap.detection.label, description: cap.detection.description, source: cap.source.site }, local, statuses);
    const r = parseRefinement(run.text);
    if (!r) return;
    await updateCapture(id, (c) => {
      c.ai = { ...c.ai, description: r.description, keywords: r.keywords, topics: r.topics, model: run.route.model, local: true, at: Date.now() };
    });
  } catch {
    /* refinement is optional */
  }
}
