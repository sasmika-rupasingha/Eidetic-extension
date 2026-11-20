/**
 * Smart cleanup (v3): groups of exact duplicates, similar images (dHash), near-identical text, old temporary
 * captures and the largest captures, each with a suggestion of what to keep. Nothing is deleted here.
 */
import { jaccard, shingles } from '../memory/related';
import { hamming } from '../shared/dhash';
import { expiredIds, type Capture } from './captures';

/** Images this many bits apart or fewer look alike. */
export const SIMILAR_BITS = 6;
/** Texts sharing this much (word shingles) are near-identical. */
export const SAME_TEXT = 0.9;

export interface Group {
  /** Best first: the one suggested to keep. */
  ids: string[];
  reason: string;
}

/** Union of linked pairs into groups (each id once). */
export function groupPairs(ids: string[], linked: (a: string, b: string) => boolean): string[][] {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (linked(ids[i]!, ids[j]!)) {
        const a = find(ids[i]!);
        const b = find(ids[j]!);
        if (a !== b) parent.set(b, a);
      }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Which capture of a group to keep: pinned, then kept, then with notes or answers, then the newest. */
export function keepOrder(a: Capture, b: Capture): number {
  const score = (c: Capture) => (c.pinned ? 8 : 0) + (c.status === 'kept' ? 4 : 0) + (c.notes.trim() || c.answers.length ? 2 : 0);
  return score(b) - score(a) || b.createdAt - a.createdAt;
}

const sorted = (caps: Map<string, Capture>, ids: string[]) =>
  ids
    .map((id) => caps.get(id)!)
    .sort(keepOrder)
    .map((c) => c.id);

export interface CleanupReport {
  exact: Group[];
  similar: Group[];
  sameText: Group[];
  oldTemporary: string[];
  largest: string[];
}

/**
 * `exactKey` gives a capture's exact content key (e.g. SHA-256 of the image) when known; captures with equal keys are
 * exact duplicates. Similar images are those within SIMILAR_BITS that are not all copies of one image.
 */
export function findCleanup(caps: Capture[], exactKey: (c: Capture) => string | undefined, tempDays: number, now = Date.now()): CleanupReport {
  const byId = new Map(caps.map((c) => [c.id, c]));
  const exactGroups = new Map<string, string[]>();
  for (const c of caps) {
    const k = exactKey(c);
    if (k) exactGroups.set(k, [...(exactGroups.get(k) ?? []), c.id]);
  }
  const exact = [...exactGroups.values()].filter((g) => g.length > 1).map((g) => ({ ids: sorted(byId, g), reason: 'Identical images' }));
  const inExact = new Map<string, string>();
  exact.forEach((g, i) => g.ids.forEach((id) => inExact.set(id, `x${i}`)));
  const similar = groupPairs(
    caps.filter((c) => c.hash).map((c) => c.id),
    (a, b) => hamming(byId.get(a)!.hash, byId.get(b)!.hash) <= SIMILAR_BITS,
  )
    // A group made only of one set of identical images is already listed above.
    .filter((g) => new Set(g.map((id) => inExact.get(id) ?? id)).size > 1)
    .map((g) => ({ ids: sorted(byId, g), reason: 'Images that look alike' }));
  const texts = caps.filter((c) => (c.ocr?.text.trim().length ?? 0) >= 20);
  const sh = new Map(texts.map((c) => [c.id, shingles(c.ocr!.text)]));
  const sameText = groupPairs(
    texts.map((c) => c.id),
    (a, b) => jaccard(sh.get(a)!, sh.get(b)!) >= SAME_TEXT,
  ).map((g) => ({ ids: sorted(byId, g), reason: 'Almost the same text' }));
  const oldTemporary = expiredIds(caps, tempDays || 7, now);
  const largest = [...caps]
    .sort((a, b) => b.image.bytes - a.image.bytes)
    .slice(0, 10)
    .map((c) => c.id);
  return { exact, similar, sameText, oldTemporary, largest };
}

/** The ones suggested for deletion: everything in each group except the first (the one to keep), never pinned or kept. */
export function suggestedDeletes(groups: Group[], byId: Map<string, Capture>): string[] {
  return groups
    .flatMap((g) => g.ids.slice(1))
    .filter((id) => {
      const c = byId.get(id);
      return c && !c.pinned && c.status !== 'kept';
    });
}

export interface Breakdown {
  key: string;
  label: string;
  count: number;
  bytes: number;
}

/** Storage by kind, workspace or month, biggest first (months newest first). */
export function breakdown(caps: Capture[], by: 'kind' | 'workspace' | 'month', name: (key: string) => string = (k) => k): Breakdown[] {
  const m = new Map<string, Breakdown>();
  for (const c of caps) {
    const key = by === 'kind' ? (c.detection?.category ?? (c.video ? 'video' : 'other')) : by === 'workspace' ? (c.workspaceId ?? '') : new Date(c.createdAt).toISOString().slice(0, 7);
    const cur = m.get(key) ?? { key, label: name(key), count: 0, bytes: 0 };
    cur.count += 1;
    cur.bytes += c.image.bytes;
    m.set(key, cur);
  }
  const list = [...m.values()];
  if (by === 'month') return list.sort((a, b) => b.key.localeCompare(a.key));
  return list.sort((a, b) => b.bytes - a.bytes);
}
