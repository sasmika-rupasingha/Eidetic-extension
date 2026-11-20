/**
 * Local comparison of captures: a word-level text diff and merging tables into one comparison table.
 * No AI, no network.
 */

export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

/** Words and the whitespace between them, so a diff can be shown with the original spacing. */
export const tokens = (t: string) => t.match(/\s+|[^\s]+/g) ?? [];

/** Longest common subsequence diff over tokens. Big inputs fall back to a line diff to stay fast. */
export function diffTokens(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
  const out: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) push('del', a[i++]!);
    else push('add', b[j++]!);
  }
  while (i < n) push('del', a[i++]!);
  while (j < m) push('add', b[j++]!);
  return out;
}

/** Text diff between two captures: by words, or by lines when the texts are very long. */
export function diffText(a: string, b: string): DiffOp[] {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length * tb.length <= 4_000_000) return diffTokens(ta, tb);
  const la = a.split('\n').map((l) => `${l}\n`);
  const lb = b.split('\n').map((l) => `${l}\n`);
  if (la.length * lb.length <= 4_000_000) return diffTokens(la, lb);
  return [
    { type: 'del', text: a },
    { type: 'add', text: b },
  ];
}

/** How much of the text is unchanged (0–1): twice the unchanged characters over all characters on both sides. */
export function sameness(ops: DiffOp[]): number {
  let same = 0;
  let changed = 0;
  for (const o of ops) {
    const k = o.text.replace(/\s+/g, '').length;
    if (o.type === 'same') same += k;
    else changed += k;
  }
  return same + changed ? (2 * same) / (2 * same + changed) : 1;
}

export interface SourceTable {
  /** Shown in the first column, e.g. "№ 0012". */
  label: string;
  rows: string[][];
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Merges tables from several captures into one comparison table. The first row of each is its header; columns are
 * matched by header name (case and spacing ignored), new columns are added on the right, and each row starts with the
 * capture it came from. Empty cells stay empty.
 */
export function mergeTables(tables: SourceTable[]): string[][] {
  const usable = tables.filter((t) => t.rows.length >= 1 && t.rows[0]!.length);
  if (!usable.length) return [];
  const header: string[] = [];
  const index = new Map<string, number>();
  for (const t of usable)
    for (const h of t.rows[0]!) {
      const k = norm(h);
      if (!k || index.has(k)) continue;
      index.set(k, header.length);
      header.push(h.trim());
    }
  const out: string[][] = [['Source', ...header]];
  for (const t of usable) {
    const cols = t.rows[0]!.map((h) => index.get(norm(h)));
    for (const r of t.rows.slice(1)) {
      const row = Array.from({ length: header.length }, () => '');
      r.forEach((v, i) => {
        const at = cols[i];
        if (at !== undefined) row[at] = v;
      });
      if (row.some((v) => v.trim())) out.push([t.label, ...row]);
    }
  }
  return out;
}
