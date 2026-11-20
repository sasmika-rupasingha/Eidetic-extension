import { describe, expect, it } from 'vitest';
import { classify } from '../src/detect/classify';
import type { Capture } from '../src/store/captures';
import { editDistance, search, wordMatch } from '../src/search/search';

let n = 0;
function cap(text: string, extra: Partial<Capture> = {}): Capture {
  n++;
  return {
    id: `c${n}`,
    number: n,
    createdAt: Date.now() - n * 1000,
    status: 'temporary',
    pinned: false,
    source: { url: 'https://lms.university.edu/x', title: 'Week 7', site: 'lms.university.edu' },
    image: { blobId: 'b', w: 1, h: 1, bytes: 1, mime: 'image/png', thumb: '' },
    processing: 'done',
    ocr: { text, langs: ['eng'], confidence: 90, lines: [] },
    detection: classify({ text }),
    notes: '',
    ai: {},
    answers: [],
    relations: [],
    ...extra,
  };
}

const lib = [
  cap('Decision trees\n• a decision tree splits on the attribute with the highest gain\n• entropy measures impurity'),
  cap("Traceback (most recent call last):\nModuleNotFoundError: No module named 'pandas'"),
  cap('Weather data set', { notes: 'practise decision tree questions', status: 'kept' }),
  cap('Week 7 lecture', { video: { time: 2292, title: 'Lecture 7: choosing splits', url: 'https://youtube.com/watch?v=x' } }),
];

describe('library search', () => {
  it('finds a phrase and explains where it matched', () => {
    const r = search(lib, 'decision tree');
    expect(r.map((m) => m.capture.id)).toEqual(['c1', 'c3']);
    expect(r[0]!.snippet?.hit.toLowerCase()).toBe('decision tree');
    expect(r[1]!.field).toBe('note');
  });
  it('tolerates typos and OCR confusions', () => {
    expect(wordMatch('entrpy', 'entropy')).toBeGreaterThan(0);
    expect(wordMatch('modu1e', 'module')).toBeGreaterThan(0);
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
    expect(search(lib, 'pandsa').map((m) => m.capture.id)).toEqual(['c2']);
  });
  it('every word must match somewhere', () => {
    expect(search(lib, 'pandas entropy')).toEqual([]);
  });
  it('matches video titles and filters', () => {
    expect(search(lib, 'splits', 'video').map((m) => m.capture.id)).toEqual(['c4']);
    expect(search(lib, '', 'kept').map((m) => m.capture.id)).toEqual(['c3']);
    expect(search(lib, '', 'error').map((m) => m.capture.id)).toEqual(['c2']);
  });
});
