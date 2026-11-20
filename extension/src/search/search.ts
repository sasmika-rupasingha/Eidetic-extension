/**
 * Local search over the capture library: no AI and no network. Every query word must match somewhere (exactly, as a
 * prefix, or as a near miss that tolerates typos and OCR confusions like 0/O, 1/l, rn/m). Results say why they matched.
 */
import { CATEGORY_LABEL, type Category } from '../detect/classify';
import type { Capture } from '../store/captures';

export type Field = 'description' | 'note' | 'keywords' | 'title' | 'text' | 'video' | 'site' | 'kind' | 'answer';

const WEIGHT: Record<Field, number> = { description: 5, keywords: 4, note: 4, title: 3, video: 3, kind: 3, text: 2, site: 2, answer: 1 };
export const FIELD_LABEL: Record<Field, string> = {
  description: 'In the description', note: 'In your note', keywords: 'In the keywords', title: 'In the page title', text: 'In the captured text',
  video: 'In the video title', site: 'From the site', kind: 'By kind', answer: 'In a saved answer',
};

export type Filter = 'all' | 'kept' | 'video' | Category;

export interface Match {
  capture: Capture;
  score: number;
  field: Field;
  /** A short piece of the matching text and the part to highlight. */
  snippet: { before: string; hit: string; after: string } | null;
}

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'");

const tokenize = (s: string) => fold(s).match(/[\p{L}\p{N}][\p{L}\p{N}'+#.-]*/gu)?.map((t) => t.replace(/[.'-]+$/, '')) ?? [];

/** OCR often confuses these; fold them together for near-miss matching. */
const ocrFold = (s: string) => s.replace(/rn/g, 'm').replace(/[0o]/g, 'o').replace(/[1il|]/g, 'l').replace(/5/g, 's');

/** Edit distance where swapping two neighbouring letters counts as one typo (optimal string alignment). */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

/** How well a query word matches a text word: 1 exact, 0.8 prefix, 0.6 near miss, 0 none. */
export function wordMatch(q: string, w: string): number {
  if (q === w) return 1;
  if (q.length >= 3 && w.startsWith(q)) return 0.8;
  if (q.length >= 5) {
    const max = q.length >= 8 ? 2 : 1;
    if (editDistance(ocrFold(q), ocrFold(w), max) <= max) return 0.6;
  }
  return 0;
}

function fieldsOf(c: Capture): Array<[Field, string]> {
  const d = c.detection;
  return [
    ['description', [c.ai.description, d?.description].filter(Boolean).join(' · ')],
    ['note', c.notes],
    ['keywords', [...(c.ai.keywords ?? []), ...(c.ai.topics ?? [])].join(' ')],
    ['title', c.source.title],
    ['video', c.video?.title ?? ''],
    ['kind', d ? `${CATEGORY_LABEL[d.category]} ${d.label}` : ''],
    ['text', c.ocr?.text ?? ''],
    ['site', c.source.site],
    ['answer', c.answers.map((a) => a.text).join('\n')],
  ];
}

function snippetOf(text: string, hitStart: number, hitLen: number): Match['snippet'] {
  const flat = text.replace(/\s+/g, ' ');
  // Re-find the hit in the flattened text around the same place.
  const ratio = text.length ? hitStart / text.length : 0;
  const approx = Math.round(ratio * flat.length);
  const piece = text.slice(hitStart, hitStart + hitLen).replace(/\s+/g, ' ');
  let at = flat.indexOf(piece, Math.max(0, approx - 40));
  if (at < 0) at = flat.indexOf(piece);
  if (at < 0) return null;
  const s = Math.max(0, at - 36);
  const e = Math.min(flat.length, at + piece.length + 44);
  return { before: (s > 0 ? '…' : '') + flat.slice(s, at).trimStart(), hit: flat.slice(at, at + piece.length), after: flat.slice(at + piece.length, e).trimEnd() + (e < flat.length ? '…' : '') };
}

function locateInField(text: string, queryWords: string[], phrase: string): { start: number; len: number } | null {
  const f = fold(text);
  const p = f.indexOf(phrase);
  if (phrase.length >= 3 && p >= 0) return { start: p, len: phrase.length };
  for (const m of f.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'+#.-]*/gu)) {
    const w = m[0].replace(/[.'-]+$/, '');
    if (queryWords.some((q) => wordMatch(q, w) > 0)) return { start: m.index, len: w.length };
  }
  return null;
}

export function matchesFilter(c: Capture, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'kept') return c.status === 'kept' || c.pinned;
  if (filter === 'video') return Boolean(c.video);
  return c.detection?.category === filter;
}

export function search(captures: Capture[], query: string, filter: Filter = 'all'): Match[] {
  const pool = captures.filter((c) => matchesFilter(c, filter));
  const qWords = [...new Set(tokenize(query))];
  if (!qWords.length) return pool.map((capture) => ({ capture, score: 0, field: 'description' as Field, snippet: null }));
  const phrase = fold(query.trim());
  const out: Match[] = [];
  for (const c of pool) {
    const fields = fieldsOf(c).map(([f, t]) => [f, t, tokenize(t)] as const);
    let total = 0;
    let allFound = true;
    const perField = new Map<Field, number>();
    for (const q of qWords) {
      let best = 0;
      let bestField: Field | null = null;
      for (const [f, , toks] of fields) {
        let m = 0;
        for (const w of toks) {
          const s = wordMatch(q, w);
          if (s > m) m = s;
          if (m === 1) break;
        }
        const weighted = m * WEIGHT[f];
        if (weighted > best) {
          best = weighted;
          bestField = f;
        }
      }
      if (!bestField) {
        allFound = false;
        break;
      }
      total += best;
      perField.set(bestField, (perField.get(bestField) ?? 0) + best);
    }
    if (!allFound) continue;
    // Whole-phrase bonus, and a small boost for kept/pinned and recent captures.
    const phraseField = fields.find(([, t]) => phrase.length >= 3 && fold(t).includes(phrase));
    if (phraseField) total += 3 * WEIGHT[phraseField[0]];
    if (c.pinned) total += 1;
    if (c.status === 'kept') total += 0.5;
    total += Math.max(0, 1 - (Date.now() - c.createdAt) / (90 * 86_400_000)) * 0.5;
    const field = phraseField?.[0] ?? [...perField.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const text = fields.find(([f]) => f === field)![1];
    const loc = locateInField(text, qWords, phrase);
    out.push({ capture: c, score: total, field, snippet: loc && field !== 'kind' && field !== 'site' ? snippetOf(text, loc.start, loc.len) : null });
  }
  return out.sort((a, b) => b.score - a.score || b.capture.createdAt - a.capture.createdAt);
}
