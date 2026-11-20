/**
 * Capture & Compare (and website monitoring): what changed between an earlier text and a newer one, in categories a
 * person can scan: text added, removed and changed, and numbers changed (old → new). Also an image difference mask.
 * Local only.
 */
import { diffTokens } from './diff';

export interface NumberChange {
  /** The words just before the number in the new text ("Price"), when there are any. */
  label: string;
  from: string;
  to: string;
}

export interface ChangeSummary {
  added: string[];
  removed: string[];
  changed: Array<{ from: string; to: string }>;
  numbers: NumberChange[];
  /** Nothing changed at all (ignoring spacing). */
  same: boolean;
}

const NUM = /[-+]?(?:[$€£¥₹]|Rs\.?\s?)?\d[\d,]*(?:\.\d+)?%?/g;

export const linesOf = (t: string) =>
  t
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** Numbers that differ between two versions of a line, with the words before them as a label. */
export function numberChanges(from: string, to: string): NumberChange[] {
  const a = [...from.matchAll(NUM)];
  const b = [...to.matchAll(NUM)];
  if (!a.length || a.length !== b.length) return [];
  const out: NumberChange[] = [];
  b.forEach((m, i) => {
    const old = a[i]![0];
    if (old === m[0]) return;
    const before = to.slice(0, m.index).replace(/[:=–—-]\s*$/, '').trim();
    const label = (before.split(/[.;|,]\s/).pop() ?? '').split(' ').slice(-4).join(' ').replace(/[:=]$/, '').trim();
    out.push({ label, from: old, to: m[0] });
  });
  return out;
}

/** Similar enough to call it "the same line, edited" rather than one removed and one added. */
function similar(a: string, b: string): boolean {
  const wa = new Set(a.toLowerCase().split(' '));
  const wb = b.toLowerCase().split(' ');
  const shared = wb.filter((w) => wa.has(w)).length;
  return shared / Math.max(wa.size, wb.length) >= 0.4 || (numberChanges(a, b).length > 0 && a.replace(NUM, '#') === b.replace(NUM, '#'));
}

export function summarizeChanges(oldText: string, newText: string): ChangeSummary {
  const a = linesOf(oldText);
  const b = linesOf(newText);
  const ops = diffTokens(a.map((l) => `${l}\n`), b.map((l) => `${l}\n`));
  const out: ChangeSummary = { added: [], removed: [], changed: [], numbers: [], same: true };
  let dels: string[] = [];
  let adds: string[] = [];
  const flush = () => {
    // Pair removed and added lines that look like edits of each other.
    for (const d of dels) {
      const i = adds.findIndex((x) => similar(d, x));
      if (i >= 0) {
        const to = adds.splice(i, 1)[0]!;
        out.changed.push({ from: d, to });
        out.numbers.push(...numberChanges(d, to));
      } else out.removed.push(d);
    }
    out.added.push(...adds);
    dels = [];
    adds = [];
  };
  for (const op of ops) {
    const lines = op.text.split('\n').filter(Boolean);
    if (op.type === 'same') flush();
    else if (op.type === 'del') dels.push(...lines);
    else adds.push(...lines);
  }
  flush();
  out.same = !out.added.length && !out.removed.length && !out.changed.length;
  return out;
}

/** One line for a list or a badge: "2 added · 1 removed · 1 number changed". */
export function changeLine(s: ChangeSummary): string {
  if (s.same) return 'No change in the text';
  const parts: string[] = [];
  const n = (k: number, one: string, many: string) => k && parts.push(`${k} ${k === 1 ? one : many}`);
  n(s.numbers.length, 'number changed', 'numbers changed');
  n(s.changed.length, 'line changed', 'lines changed');
  n(s.added.length, 'line added', 'lines added');
  n(s.removed.length, 'line removed', 'lines removed');
  return parts.join(' · ');
}

/**
 * Marks the pixels that differ between two same-sized RGBA images. Returns a red, half-transparent mask and the share
 * of pixels that changed. Small differences (compression, anti-aliasing) under `threshold` are ignored.
 */
export function diffMask(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number, threshold = 48): { mask: Uint8ClampedArray<ArrayBuffer>; changed: number } {
  const mask = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const d = Math.abs(a[o]! - b[o]!) + Math.abs(a[o + 1]! - b[o + 1]!) + Math.abs(a[o + 2]! - b[o + 2]!);
    if (d > threshold) {
      changed++;
      mask[o] = 230;
      mask[o + 1] = 40;
      mask[o + 2] = 40;
      mask[o + 3] = 150;
    }
  }
  return { mask, changed: w * h ? changed / (w * h) : 0 };
}

/** Scales a box chosen in one viewport to another of a different size (window resized between captures). */
export function scaleRect(r: { x: number; y: number; w: number; h: number }, from: { w: number; h: number }, to: { w: number; h: number }) {
  const sx = to.w / (from.w || to.w);
  const sy = to.h / (from.h || to.h);
  return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };
}

/** Options for "Compare with a new capture": the same box when the tab shows the same page. */
export function recaptureOptions(c: { id: string; source: { url: string }; area?: { rect: { x: number; y: number; w: number; h: number }; viewport: { w: number; h: number } } }, tabUrl: string | undefined, samePage: (a: string, b: string) => boolean) {
  const preset = c.area && tabUrl && samePage(tabUrl, c.source.url) ? { ...c.area.rect, vw: c.area.viewport.w, vh: c.area.viewport.h } : null;
  return { preset, compareTo: c.id };
}
