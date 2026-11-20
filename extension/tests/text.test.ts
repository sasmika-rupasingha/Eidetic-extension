import { describe, expect, it } from 'vitest';
import { boldPrefixLength, chunkText, clip, parseJsonLoose, readingMinutes, splitSentences } from '../src/shared/text';

describe('splitSentences', () => {
  it('splits on sentence ends but not abbreviations or decimals', () => {
    expect(splitSentences('It costs 3.5 dollars. Dr. Silva agreed, e.g. for labs! Really? Yes')).toEqual(['It costs 3.5 dollars.', 'Dr. Silva agreed, e.g. for labs!', 'Really?', 'Yes']);
  });
  it('handles empty text', () => expect(splitSentences('  ')).toEqual([]));
});

describe('chunkText', () => {
  it('keeps chunks under the size on paragraph boundaries', () => {
    const t = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ${'word '.repeat(40)}`).join('\n\n');
    const chunks = chunkText(t, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join('\n\n').replace(/\s+/g, ' ')).toBe(t.replace(/\s+/g, ' '));
  });
});

describe('helpers', () => {
  it('clips on a boundary', () => expect(clip('One. Two three four five.', 12)).toBe('One. Two …'));
  it('estimates reading time', () => expect(readingMinutes('word '.repeat(460))).toBe(2));
  it('bolds the start of words', () => {
    expect(boldPrefixLength('a')).toBe(1);
    expect(boldPrefixLength('reading')).toBe(4);
  });
  it('pulls JSON out of chatty replies', () => {
    expect(parseJsonLoose('Sure! ```json\n["b1","i2"]\n```')).toEqual(['b1', 'i2']);
    expect(parseJsonLoose('Here: {"a":1} done')).toEqual({ a: 1 });
    expect(parseJsonLoose('no json')).toBeNull();
  });
});
