import { beforeEach, describe, expect, it } from 'vitest';
import { findRelated, jaccard, mergeRelations, relate, prepare, shingles, topicCounts, when } from '../src/memory/related';
import { linkRelated, removeRelation } from '../src/memory/link';
import { addCapture, getCapture, resetDbForTests, updateCapture, type Capture } from '../src/store/captures';

const MIN = 60_000;
let n = 0;
export function cap(p: Partial<Capture> & { text?: string } = {}): Capture {
  n += 1;
  const { text, ...rest } = p;
  return {
    id: `c${n}`,
    number: n,
    createdAt: 1_700_000_000_000,
    status: 'temporary',
    pinned: false,
    source: { url: `https://site${n}.org/p${n}`, title: 'T', site: `site${n}.org` },
    image: { blobId: `b${n}`, w: 1, h: 1, bytes: 1, mime: 'image/png', thumb: '' },
    processing: 'done',
    ocr: { text: text ?? `unique words number ${n} alpha${n} beta${n} gamma${n}`, langs: ['eng'], confidence: 90, lines: [] },
    notes: '',
    ai: {},
    answers: [],
    relations: [],
    ...rest,
  } as Capture;
}

describe('Visual Memory rules', () => {
  it('describes time gaps', () => {
    expect(when(0, 4 * MIN)).toBe('4 min later');
    expect(when(3 * 3600_000, 0)).toBe('3 h earlier');
    expect(when(0, 3 * 86_400_000)).toBe('3 days later');
  });
  it('links the same page close in time', () => {
    const a = cap({ source: { url: 'https://docs.org/guide#x', title: 'G', site: 'docs.org' } });
    const b = cap({ source: { url: 'https://docs.org/guide', title: 'G', site: 'docs.org' }, createdAt: a.createdAt + 10 * MIN });
    const l = relate(prepare(a), prepare(b));
    expect(l?.reason).toMatch(/Same page, 10 min later/);
  });
  it('links the same video with the moment gap', () => {
    const v = (time: number) => ({ time, title: 'Lecture', url: 'https://www.youtube.com/watch?v=abc&t=3' });
    const a = cap({ video: v(60) });
    const b = cap({ video: v(300) });
    expect(relate(prepare(a), prepare(b))?.reason).toMatch(/Same video, 4 min later in it/);
    const c = cap({ video: { time: 60, title: 'Other', url: 'https://www.youtube.com/watch?v=zzz' } });
    expect(relate(prepare(a), prepare(c))).toBeNull();
  });
  it('links shared topics', () => {
    const a = cap({ ai: { topics: ['Machine learning'], keywords: ['accuracy'] } });
    const b = cap({ ai: { topics: ['machine learning'], keywords: ['accuracy', 'recall'] } });
    expect(relate(prepare(a), prepare(b))?.reason).toMatch(/Shared topic: machine learning, accuracy/);
  });
  it('measures text overlap with word shingles', () => {
    const t = 'gradient descent updates the weights in the direction that reduces the loss function step by step';
    expect(jaccard(shingles(t), shingles(t))).toBe(1);
    const a = cap({ text: t });
    const b = cap({ text: `${t} until it converges` });
    expect(relate(prepare(a), prepare(b))?.reason).toMatch(/Almost the same text|Similar text/);
    expect(relate(prepare(a), prepare(cap()))).toBeNull();
  });
  it('links the same error', () => {
    const det = { category: 'error', label: 'Programming error · Python', description: 'x', confidence: 1, by: 'rules', entities: [], error: { language: 'Python', type: 'ModuleNotFoundError', message: "No module named 'pandas'" } } as unknown as Capture['detection'];
    const a = cap({ detection: det });
    const b = cap({ detection: det });
    expect(relate(prepare(a), prepare(b))?.reason).toMatch(/Same error: ModuleNotFoundError/);
  });
  it('uses embeddings from the same model only', () => {
    const a = cap({ embedding: { model: 'nomic', vector: [1, 0, 0], at: 0 } });
    const b = cap({ embedding: { model: 'nomic', vector: [0.95, 0.1, 0], at: 0 } });
    const c = cap({ embedding: { model: 'other', vector: [1, 0, 0], at: 0 } });
    expect(relate(prepare(a), prepare(b))?.reason).toMatch(/Similar in meaning/);
    expect(relate(prepare(a), prepare(c))).toBeNull();
  });
  it('ranks the strongest links first and ignores unprocessed captures', () => {
    const t = 'the quick brown fox jumps over the lazy dog near the river bank today';
    const a = cap({ text: t, ai: { topics: ['foxes'] } });
    const strong = cap({ text: t, ai: { topics: ['foxes'] } });
    const weak = cap({ ai: { topics: ['foxes'], keywords: ['dog'] }, text: 'something else entirely about cats and mice' });
    const reading = cap({ text: t, processing: 'reading' });
    const ids = findRelated(a, [a, weak, strong, reading]).map((l) => l.id);
    expect(ids).toEqual([strong.id]);
  });
  it('keeps removed links removed and user links in place', () => {
    const merged = mergeRelations(
      [
        { id: 'x', reason: 'old', by: 'rules', removed: true },
        { id: 'u', reason: 'mine', by: 'user' },
        { id: 'r', reason: 'stale', by: 'rules' },
      ],
      [{ id: 'x', score: 9, reason: 'again' }, { id: 'n', score: 5, reason: 'new' }],
    );
    expect(merged).toEqual([
      { id: 'u', reason: 'mine', by: 'user' },
      { id: 'n', reason: 'new', by: 'rules' },
      { id: 'x', reason: 'old', by: 'rules', removed: true },
    ]);
  });
  it('counts topics for the library filter', () => {
    expect(topicCounts([cap({ ai: { topics: ['A'] } }), cap({ ai: { topics: ['a'], keywords: ['b'] } })])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
});

describe('Visual Memory store', () => {
  beforeEach(async () => {
    await resetDbForTests();
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase('eidetic');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  const src = { url: 'https://example.org/notes', title: 'Notes', site: 'example.org' };
  const add = async (text: string) => {
    const c = await addCapture({ image: new Blob(['x']), w: 1, h: 1, thumb: '', source: src });
    return updateCapture(c.id, (x) => {
      x.processing = 'done';
      x.ocr = { text, langs: ['eng'], confidence: 90, lines: [] };
    });
  };
  it('links both ways and never recreates a removed link', async () => {
    const a = (await add('first page of notes'))!;
    const b = (await add('second page of notes'))!;
    await linkRelated(b.id);
    expect((await getCapture(b.id))?.relations.map((r) => r.id)).toEqual([a.id]);
    expect((await getCapture(a.id))?.relations[0]?.reason).toMatch(/Same page/);
    await removeRelation(a.id, b.id);
    await linkRelated(b.id);
    await linkRelated(a.id);
    expect((await getCapture(b.id))?.relations).toEqual([{ id: a.id, reason: expect.any(String), by: 'rules', removed: true }]);
    expect((await getCapture(a.id))?.relations.every((r) => r.removed)).toBe(true);
  });
});
