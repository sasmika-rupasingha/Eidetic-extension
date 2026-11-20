import { describe, expect, it } from 'vitest';
import { changeLine, diffMask, numberChanges, recaptureOptions, scaleRect, summarizeChanges } from '../src/compare/changes';

describe('change categories', () => {
  it('finds added, removed and changed lines and changed numbers', () => {
    const old = 'Course fees\nTuition: $1,200 per term\nLab fee: $80\nDeadline 12 March';
    const neu = 'Course fees\nTuition: $1,350 per term\nDeadline 12 March\nLate fee applies after the deadline';
    const s = summarizeChanges(old, neu);
    expect(s.numbers).toEqual([{ label: 'Tuition', from: '$1,200', to: '$1,350' }]);
    expect(s.changed).toEqual([{ from: 'Tuition: $1,200 per term', to: 'Tuition: $1,350 per term' }]);
    expect(s.removed).toEqual(['Lab fee: $80']);
    expect(s.added).toEqual(['Late fee applies after the deadline']);
    expect(changeLine(s)).toBe('1 number changed · 1 line changed · 1 line added · 1 line removed');
  });
  it('ignores spacing-only differences', () => {
    const s = summarizeChanges('a  b\n\nc', 'a b\nc ');
    expect(s.same).toBe(true);
    expect(changeLine(s)).toBe('No change in the text');
  });
  it('reports numbers only when the line keeps its shape', () => {
    expect(numberChanges('Score 10 of 20', 'Score 12 of 20')).toEqual([{ label: 'Score', from: '10', to: '12' }]);
    expect(numberChanges('1 2', '1 2 3')).toEqual([]);
    expect(numberChanges('Up 5%', 'Up 7.5%')).toEqual([{ label: 'Up', from: '5%', to: '7.5%' }]);
  });
});

describe('image difference', () => {
  it('marks changed pixels and ignores small noise', () => {
    const a = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255]);
    const b = new Uint8ClampedArray([10, 10, 10, 255, 250, 250, 250, 255]);
    const { mask, changed } = diffMask(a, b, 2, 1);
    expect(changed).toBe(0.5);
    expect(Array.from(mask.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(mask[7]).toBeGreaterThan(0);
  });
});

describe('recapturing the same area', () => {
  const cap = { id: 'c1', source: { url: 'https://x.org/p' }, area: { rect: { x: 10, y: 20, w: 100, h: 50 }, viewport: { w: 1000, h: 800 } } };
  const same = (a: string, b: string) => a === b;
  it('presets the old box on the same page only', () => {
    expect(recaptureOptions(cap, 'https://x.org/p', same)).toEqual({ preset: { x: 10, y: 20, w: 100, h: 50, vw: 1000, vh: 800 }, compareTo: 'c1' });
    expect(recaptureOptions(cap, 'https://x.org/other', same)).toEqual({ preset: null, compareTo: 'c1' });
  });
  it('scales a box to another window size', () => {
    expect(scaleRect({ x: 10, y: 20, w: 100, h: 50 }, { w: 1000, h: 800 }, { w: 500, h: 400 })).toEqual({ x: 5, y: 10, w: 50, h: 25 });
  });
});
