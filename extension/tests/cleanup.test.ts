import { describe, expect, it } from 'vitest';
import { breakdown, findCleanup, groupPairs, keepOrder, suggestedDeletes } from '../src/store/cleanup';
import { dhashFromGray, hamming, toGray } from '../src/shared/dhash';
import type { Capture } from '../src/store/captures';

/** A 9 × 8 gradient, optionally with some pixels nudged. */
const gradient = (nudge: number[] = []) => Array.from({ length: 72 }, (_, i) => ((i % 9) * 20 + (nudge.includes(i) ? 100 : 0)) % 256);

describe('dHash', () => {
  it('hashes 9 × 8 grey values into 16 hex digits', () => {
    expect(dhashFromGray(gradient())).toBe('0000000000000000');
    expect(dhashFromGray(gradient().reverse())).toBe('ffffffffffffffff');
    expect(() => dhashFromGray([1, 2, 3])).toThrow();
  });
  it('puts similar images a few bits apart', () => {
    const a = dhashFromGray(gradient());
    const b = dhashFromGray(gradient([4, 13]));
    expect(hamming(a, b)).toBeGreaterThan(0);
    expect(hamming(a, b)).toBeLessThanOrEqual(4);
    expect(hamming(a, a)).toBe(0);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming(undefined, a)).toBe(64);
    expect(hamming('zz00000000000000', a)).toBe(64);
  });
  it('converts RGBA to grey', () => {
    expect(toGray([255, 255, 255, 255, 0, 0, 0, 255]).map(Math.round)).toEqual([255, 0]);
  });
});

let n = 0;
const cap = (p: Partial<Capture> & { text?: string } = {}): Capture => {
  n += 1;
  const { text, ...rest } = p;
  return { id: `c${n}`, number: n, createdAt: n * 1000, status: 'temporary', pinned: false, source: { url: '', title: '', site: '' }, image: { blobId: `b${n}`, w: 1, h: 1, bytes: n * 100, mime: 'image/png', thumb: '' }, processing: 'done', ocr: { text: text ?? `text ${n}`, langs: ['eng'], confidence: 90, lines: [] }, notes: '', ai: {}, answers: [], relations: [], ...rest } as Capture;
};

describe('grouping', () => {
  it('joins linked pairs into groups', () => {
    const groups = groupPairs(['a', 'b', 'c', 'd'], (x, y) => (x === 'a' && y === 'b') || (x === 'b' && y === 'c'));
    expect(groups).toEqual([['a', 'b', 'c']]);
  });
  it('keeps pinned, then kept, then annotated, then the newest', () => {
    const old = cap({ createdAt: 1 });
    const newest = cap({ createdAt: 9 });
    const kept = cap({ status: 'kept', createdAt: 2 });
    const pinned = cap({ pinned: true, createdAt: 0 });
    const noted = cap({ notes: 'x', createdAt: 3 });
    expect([old, newest, kept, noted, pinned].sort(keepOrder).map((c) => c.id)).toEqual([pinned.id, kept.id, noted.id, newest.id, old.id]);
  });
});

describe('cleanup report', () => {
  it('finds exact duplicates, look-alikes and near-identical text; suggests deleting all but one', () => {
    const h = dhashFromGray(gradient());
    const h2 = dhashFromGray(gradient([4, 13]));
    const long = 'Gradient descent updates every weight a little in the direction that lowers the loss on the training data';
    const a = cap({ hash: h, text: long });
    const b = cap({ hash: h, text: long });
    const keptCopy = cap({ hash: h, status: 'kept' });
    const alike = cap({ hash: h2 });
    const other = cap({ hash: 'ffffffffffffffff' });
    const textTwin = cap({ text: `${long}.` });
    const exactKey = (c: Capture) => ([a.id, b.id, keptCopy.id].includes(c.id) ? 'sha-1' : undefined);
    const r = findCleanup([a, b, keptCopy, alike, other, textTwin], exactKey, 7, 10_000);
    expect(r.exact).toEqual([{ ids: [keptCopy.id, b.id, a.id], reason: 'Identical images' }]);
    expect(r.similar).toHaveLength(1);
    expect(r.similar[0]!.ids).toContain(alike.id);
    expect(r.similar[0]!.ids).not.toContain(other.id);
    expect(r.sameText[0]!.ids.sort()).toEqual([a.id, b.id, textTwin.id].sort());
    const byId = new Map([a, b, keptCopy, alike, other, textTwin].map((c) => [c.id, c]));
    expect(suggestedDeletes(r.exact, byId)).toEqual([b.id, a.id]);
    expect(r.largest[0]).toBe(textTwin.id);
  });
  it('lists only untouched old temporary captures', () => {
    const old = cap({ createdAt: 0 });
    const fresh = cap({ createdAt: 9 * 86_400_000 });
    expect(findCleanup([old, fresh], () => undefined, 7, 10 * 86_400_000).oldTemporary).toEqual([old.id]);
  });
});

describe('storage breakdown', () => {
  it('sums by kind, workspace and month', () => {
    const det = (category: string) => ({ category }) as unknown as Capture['detection'];
    const caps = [
      cap({ detection: det('table'), createdAt: Date.UTC(2026, 10, 3), workspaceId: 'w1' }),
      cap({ detection: det('table'), createdAt: Date.UTC(2026, 9, 3) }),
      cap({ detection: det('error'), createdAt: Date.UTC(2026, 10, 9), workspaceId: 'w1' }),
    ];
    const kinds = breakdown(caps, 'kind');
    expect(kinds.map((k) => [k.key, k.count])).toEqual([
      ['table', 2],
      ['error', 1],
    ]);
    expect(breakdown(caps, 'workspace', (k) => k || 'none').map((w) => [w.label, w.count])).toEqual([
      ['w1', 2],
      ['none', 1],
    ]);
    expect(breakdown(caps, 'month').map((m) => m.key)).toEqual(['2026-11', '2026-10']);
  });
});
