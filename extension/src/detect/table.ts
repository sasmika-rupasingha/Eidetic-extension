/**
 * Turns recognised words with positions into a table when the snip looks like one
 * (several rows whose cells are separated by wide gaps that line up).
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrWord {
  text: string;
  bbox: Box;
}
export interface OcrLine {
  text: string;
  bbox: Box;
  words: OcrWord[];
}

/** Splits a line into cells where the gap between words is much wider than a normal space. */
export function lineToCells(line: OcrLine, gapFactor = 1.6): Array<{ text: string; x0: number; x1: number }> {
  const words = [...line.words].filter((w) => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (!words.length) return [];
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const h = heights[Math.floor(heights.length / 2)] || 10;
  const cells: Array<{ text: string; x0: number; x1: number }> = [];
  let cur = { text: words[0]!.text, x0: words[0]!.bbox.x0, x1: words[0]!.bbox.x1 };
  for (const w of words.slice(1)) {
    const gap = w.bbox.x0 - cur.x1;
    if (gap > h * gapFactor) {
      cells.push(cur);
      cur = { text: w.text, x0: w.bbox.x0, x1: w.bbox.x1 };
    } else {
      cur.text += ` ${w.text}`;
      cur.x1 = w.bbox.x1;
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * Returns rows of cells if the lines form a table, else null.
 * Column positions come from the line with the most cells; other rows' cells are placed in the nearest column.
 */
export function detectTable(lines: OcrLine[]): string[][] | null {
  const rows = lines.map((l) => lineToCells(l)).filter((r) => r.length);
  if (rows.length < 3) return null;
  const multi = rows.filter((r) => r.length >= 2);
  if (multi.length < Math.max(3, Math.ceil(rows.length * 0.6))) return null;

  const counts = new Map<number, number>();
  for (const r of multi) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  const [cols] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
  if (cols < 2) return null;
  const template = multi.filter((r) => r.length === cols);
  if (template.length < Math.ceil(multi.length * 0.5)) return null;

  // Column anchors: mean left edge of each column across the template rows.
  const anchors = Array.from({ length: cols }, (_, c) => template.reduce((s, r) => s + r[c]!.x0, 0) / template.length);
  return rows.map((r) => {
    const out: string[] = Array.from({ length: cols }, () => '');
    for (const cell of r) {
      let best = 0;
      for (let c = 1; c < cols; c++) if (Math.abs(anchors[c]! - cell.x0) < Math.abs(anchors[best]! - cell.x0)) best = c;
      out[best] = out[best] ? `${out[best]} ${cell.text}` : cell.text;
    }
    return out;
  });
}

const csvCell = (v: string) => {
  // Neutralise spreadsheet formulas from untrusted text (=, +, -, @ at the start).
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCSV = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
export const toTSV = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
export function toMarkdown(rows: string[][]): string {
  if (!rows.length) return '';
  const esc = (c: string) => c.replace(/\|/g, '\\|');
  const [head, ...body] = rows;
  return [`| ${head!.map(esc).join(' | ')} |`, `| ${head!.map(() => '---').join(' | ')} |`, ...body.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
}
