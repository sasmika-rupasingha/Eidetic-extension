/** Small text helpers shared by the reader, read-aloud and the AI prompts. */

/** Splits text into sentences, keeping abbreviations like "e.g." and decimals together. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  const re = /[^.!?。！？]+(?:[.!?。！？]+["'”’)\]]*|$)/g;
  let buf = '';
  for (const m of clean.matchAll(re)) {
    buf += m[0];
    const end = m.index + m[0].length;
    const trimmed = buf.trim();
    const last = trimmed.split(' ').pop() ?? '';
    const abbrev = /^(?:e\.g|i\.e|mr|mrs|ms|dr|prof|vs|no|fig|st|jr|sr)\.$/i.test(last) || /^\p{L}\.$/u.test(last);
    const decimal = /\d\.$/.test(trimmed) && /\d/.test(clean.charAt(end));
    if (!abbrev && !decimal && /[.!?。！？]["'”’)\]]*$/.test(trimmed)) {
      out.push(trimmed);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export const wordCount = (text: string) => (text.trim().match(/\S+/g) ?? []).length;

/** Minutes to read at ~230 words per minute, at least 1. */
export const readingMinutes = (text: string) => Math.max(1, Math.round(wordCount(text) / 230));

/** Cuts text to about `max` characters on a sentence or word boundary. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  return (at > max * 0.6 ? cut.slice(0, at + 1) : cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)) + ' …';
}

/** Splits a long text into pieces of about `size` characters on paragraph or sentence boundaries. */
export function chunkText(text: string, size = 6000): string[] {
  if (text.length <= size) return [text];
  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (p.length > size) {
      for (const s of splitSentences(p)) {
        if (cur.length + s.length + 1 > size && cur) {
          out.push(cur);
          cur = '';
        }
        cur += (cur ? ' ' : '') + s;
      }
      continue;
    }
    if (cur.length + p.length + 2 > size && cur) {
      out.push(cur);
      cur = '';
    }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur) out.push(cur);
  return out;
}

/** "Bold word starts": how many leading letters of a word to emphasise. */
export const boldPrefixLength = (word: string) => (word.length <= 3 ? 1 : Math.ceil(word.length * 0.45));

/** Extracts the first JSON value (object or array) from a model reply that may contain prose or code fences. */
export function parseJsonLoose<T = unknown>(reply: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const body = (fenced ? fenced[1]! : reply).trim();
  for (const [open, close] of [
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const s = body.indexOf(open);
    const e = body.lastIndexOf(close);
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(body.slice(s, e + 1)) as T;
      } catch {
        /* try the other shape */
      }
    }
  }
  return null;
}
