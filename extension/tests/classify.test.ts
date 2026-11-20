import { describe, expect, it } from 'vitest';
import { classify, codeScore, detectError, mathScore, parseTime } from '../src/detect/classify';
import type { OcrLine } from '../src/detect/table';

describe('errors', () => {
  it('Python missing module gets a specific description', () => {
    const d = classify({ text: `Traceback (most recent call last):\n  File "train.py", line 3, in <module>\n    import pandas as pd\nModuleNotFoundError: No module named 'pandas'` });
    expect(d.category).toBe('error');
    expect(d.label).toBe('Programming error · Python');
    expect(d.description).toBe('Python error: the module ‘pandas’ isn’t installed in this environment');
    expect(d.error).toMatchObject({ language: 'Python', module: 'pandas' });
  });
  it('recognises JavaScript, Java, PHP, SQL and npm errors', () => {
    expect(detectError("Uncaught TypeError: Cannot read properties of undefined (reading 'map')\n    at App (App.jsx:12:5)")).toMatchObject({ language: 'JavaScript', type: 'TypeError' });
    expect(detectError('Exception in thread "main" java.lang.NullPointerException: x is null\n\tat Main.main(Main.java:5)')).toMatchObject({ language: 'Java', type: 'NullPointerException' });
    expect(detectError('PHP Fatal error: Uncaught Error: Call to undefined function foo() in /var/www/index.php on line 4')).toMatchObject({ language: 'PHP' });
    expect(detectError("ERROR 1146 (42S02): Table 'shop.users' doesn't exist")).toMatchObject({ language: 'SQL' });
    expect(detectError('npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree')).toMatchObject({ language: 'npm', type: 'ERESOLVE' });
    expect(detectError("Error: Cannot find module 'express'\nRequire stack:")).toMatchObject({ module: 'express' });
  });
  it('does not call ordinary prose an error', () => {
    expect(detectError('There was an error in the report, so we fixed the numbers.')).toBeNull();
  });
});

describe('code and maths', () => {
  it('scores code and guesses the language', () => {
    const c = codeScore('def area(r):\n    return 3.14 * r * r\n\nprint(area(2))');
    expect(c.score).toBeGreaterThan(0.55);
    expect(c.language).toBe('Python');
    expect(codeScore('The quick brown fox jumps over the lazy dog.\nIt was a sunny day (mostly) in the park.').score).toBeLessThan(0.55);
  });
  it('finds equations', () => {
    const m = mathScore('Gain(S, A) = Entropy(S) − Σ (|Sv| / |S|) · Entropy(Sv)');
    expect(m.score).toBeGreaterThan(0.5);
    expect(classify({ text: 'x^2 + 3x − 4 = 0\nx = (−b ± √(b² − 4ac)) / 2a' }).category).toBe('math');
  });
});

describe('other categories', () => {
  it('QR codes win and name the site', () => {
    expect(classify({ text: '', qr: 'https://www.example.org/ticket?id=1' }).description).toBe('QR code linking to example.org');
  });
  it('events need a date and a time or a venue', () => {
    const d = classify({ text: 'AI Research Symposium 2026\nDate: 12 December 2026\nTime: 9.30 am\nVenue: Main Auditorium, Malabe' });
    expect(d.category).toBe('event');
    expect(d.event).toMatchObject({ date: '2026-12-12', time: '09:30', place: 'Main Auditorium, Malabe' });
    expect(d.description).toContain('AI Research Symposium 2026');
  });
  it('parses 12 and 24 hour times', () => {
    expect(parseTime('starts 6:30 pm sharp')).toBe('18:30');
    expect(parseTime('at 9 am')).toBe('09:00');
    expect(parseTime('Time: 9.30 am')).toBe('09:30');
    expect(parseTime('12 pm lunch')).toBe('12:00');
    expect(parseTime('14:05 – 15:00')).toBe('14:05');
  });
  it('receipts list items and the total', () => {
    const d = classify({ text: 'CITY CAFE\nLatte 650.00\nCroissant 420.00\nWater 150.00\nSubtotal 1220.00\nTOTAL 1220.00\nThank you' });
    expect(d.category).toBe('receipt');
    expect(d.receipt?.items.map((i) => i.name)).toEqual(['Latte', 'Croissant', 'Water']);
    expect(d.receipt?.total).toBe('1220.00');
  });
  it('job advertisements', () => {
    const d = classify({ text: 'Junior Data Analyst (Full-time, Hybrid)\nResponsibilities\n- Build dashboards\nRequirements\n- SQL and Python\n- 1 year experience\nApply by 30 Nov' });
    expect(d.category).toBe('job');
    expect(d.description).toBe('Job advertisement: Junior Data Analyst (Full-time, Hybrid)');
  });
  it('slides and questions', () => {
    expect(classify({ text: 'Information gain\n• Entropy measures how mixed the classes are\n• Split on the attribute with the highest gain\n• Stop when a node is pure' }).category).toBe('slide');
    expect(classify({ text: 'Question 3. A bag has 4 red and 6 blue balls. What is the probability of drawing two red balls without replacement?' }).category).toBe('question');
  });
  it('tables from word positions', () => {
    const row = (y: number, cells: string[]): OcrLine => {
      const words = cells.map((t, i) => ({ text: t, bbox: { x0: i * 200, y0: y, x1: i * 200 + 60, y1: y + 20 } }));
      return { text: cells.join(' '), bbox: { x0: 0, y0: y, x1: 600, y1: y + 20 }, words };
    };
    const lines = [row(0, ['Model', 'Accuracy', 'F1']), row(30, ['CNN', '0.91', '0.89']), row(60, ['SVM', '0.84', '0.80']), row(90, ['RF', '0.87', '0.85'])];
    const d = classify({ text: lines.map((l) => l.text).join('\n'), lines });
    expect(d.category).toBe('table');
    expect(d.label).toBe('Table · 4 × 3');
    expect(d.description).toBe('Table of 3 rows: Model, Accuracy, F1');
  });
  it('images with no text and plain text fallbacks', () => {
    expect(classify({ text: '' }).category).toBe('image');
    const t = classify({ text: 'The museum opened in 1877 and holds one of the largest natural history collections in the region, with many visitors each year.' });
    expect(t.category).toBe('text');
    expect(t.by).toBe('rules');
  });
});
