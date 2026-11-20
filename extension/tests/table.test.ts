import { describe, expect, it } from 'vitest';
import { detectTable, lineToCells, toCSV, toMarkdown, toTSV, type OcrLine } from '../src/detect/table';

const word = (text: string, x0: number, y: number) => ({ text, bbox: { x0, y0: y, x1: x0 + text.length * 8, y1: y + 14 } });
const line = (y: number, ...cells: Array<[string, number]>): OcrLine => {
  const words = cells.flatMap(([t, x]) => {
    let cx = x;
    return t.split(' ').map((w) => {
      const wd = word(w, cx, y);
      cx = wd.bbox.x1 + 6;
      return wd;
    });
  });
  return { text: cells.map((c) => c[0]).join(' '), bbox: { x0: 0, y0: y, x1: 500, y1: y + 14 }, words };
};

describe('detectTable', () => {
  it('turns aligned columns into rows and cells', () => {
    const t = detectTable([line(0, ['Module', 10], ['Credits', 200], ['Grade', 320]), line(20, ['Data Science', 10], ['4', 200], ['A-', 320]), line(40, ['Networks', 10], ['3', 200], ['B+', 320]), line(60, ['Security', 10], ['4', 200])]);
    expect(t).toEqual([
      ['Module', 'Credits', 'Grade'],
      ['Data Science', '4', 'A-'],
      ['Networks', '3', 'B+'],
      ['Security', '4', ''],
    ]);
  });

  it('returns null for ordinary paragraphs', () => {
    expect(detectTable([line(0, ['This is a normal sentence of text', 10]), line(20, ['that continues on the next line', 10]), line(40, ['and ends here.', 10])])).toBeNull();
    expect(lineToCells(line(0, ['one two three', 10]))).toHaveLength(1);
  });
});

describe('table export', () => {
  const rows = [
    ['Name', 'Note'],
    ['A, B', '=1+2'],
    ['Quote "x"', 'a|b'],
  ];
  it('writes CSV that spreadsheets cannot run as formulas', () => {
    expect(toCSV(rows)).toBe('Name,Note\n"A, B",\'=1+2\n"Quote ""x""",a|b');
  });
  it('writes TSV and Markdown', () => {
    expect(toTSV([['a\tb', 'c']])).toBe('a b\tc');
    expect(toMarkdown(rows).split('\n')[1]).toBe('| --- | --- |');
    expect(toMarkdown(rows)).toContain('a\\|b');
  });
});
