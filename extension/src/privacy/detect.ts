/**
 * Privacy Shield: finds sensitive details in recognised text and where they are in the image, so the user can
 * review them and make a safe copy. Nothing is removed from the original without the user asking.
 */
import type { Box, OcrLine } from '../detect/table';

export type PrivacyKind = 'email' | 'phone' | 'card' | 'api-key' | 'token' | 'id-number' | 'password';

export const PRIVACY_LABEL: Record<PrivacyKind, string> = {
  email: 'Email address',
  phone: 'Phone number',
  card: 'Card number',
  'api-key': 'API key',
  token: 'Access token',
  'id-number': 'ID number',
  password: 'Password',
};

/** The same names for use inside a sentence. */
export const PRIVACY_NOUN: Record<PrivacyKind, string> = {
  email: 'email address',
  phone: 'phone number',
  card: 'card number',
  'api-key': 'API key',
  token: 'access token',
  'id-number': 'ID number',
  password: 'password',
};

export interface PrivacyFinding {
  kind: PrivacyKind;
  value: string;
  /** Where it is in the image (image pixels), when the words could be located. */
  boxes: Box[];
}

/** Luhn check for card numbers. */
export function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const PATTERNS: Array<[PrivacyKind, RegExp, ((m: string) => boolean)?]> = [
  ['api-key', /\b(sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|xox[abposr]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{20,})\b/g],
  ['token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['token', /\b(?=[a-f0-9]*\d)(?=[a-f0-9]*[a-f])[a-f0-9]{32,}\b/gi],
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['card', /\b(?:\d[ -]?){12,18}\d\b/g, (m) => luhn(m.replace(/\D/g, '')) && /^[3-6]/.test(m.replace(/\D/g, ''))],
  // Sri Lankan NIC (old 9 digits + V/X, new 12 digits), US SSN, and common passport-like numbers next to a label.
  ['id-number', /\b\d{9}[VvXx]\b|\b(?:19|20)\d{10}\b|\b\d{3}-\d{2}-\d{4}\b/g],
  ['phone', /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/g, (m) => {
    const d = m.replace(/\D/g, '');
    return d.length >= 9 && d.length <= 15;
  }],
];

const PASSWORD_RE = /\b(?:password|passwd|pwd|passcode|pin|secret)\s*[:=]\s*(\S{3,})/gi;

/** Finds sensitive values in text; `lines` (OCR words with boxes) locates them in the image. */
export function findSensitive(text: string, lines: OcrLine[] = []): PrivacyFinding[] {
  const found: Array<{ kind: PrivacyKind; value: string; start: number; end: number }> = [];
  const taken = (s: number, e: number) => found.some((f) => s < f.end && e > f.start);
  for (const m of text.matchAll(PASSWORD_RE)) {
    const start = m.index + m[0].length - m[1]!.length;
    found.push({ kind: 'password', value: m[1]!, start, end: start + m[1]!.length });
  }
  for (const [kind, re, ok] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = m[0].trim();
      if (taken(m.index, m.index + m[0].length)) continue;
      if (ok && !ok(value)) continue;
      found.push({ kind, value, start: m.index, end: m.index + m[0].length });
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.start - b.start)
    .filter((f) => {
      const k = `${f.kind}:${f.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((f) => ({ kind: f.kind, value: f.value, boxes: locate(f.value, lines) }));
}

const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** Finds the words that make up `value` in the OCR lines (values may span several words, like "077 123 4567"). */
export function locate(value: string, lines: OcrLine[]): Box[] {
  const target = squash(value);
  if (!target) return [];
  const boxes: Box[] = [];
  for (const line of lines) {
    const parts = line.words.map((w) => squash(w.text));
    const joined = parts.join('');
    let from = 0;
    let at: number;
    while ((at = joined.indexOf(target, from)) >= 0) {
      const end = at + target.length;
      let pos = 0;
      parts.forEach((p, i) => {
        const s = pos;
        pos += p.length;
        if (s < end && pos > at) boxes.push(line.words[i]!.bbox);
      });
      from = end;
    }
  }
  return boxes;
}

/** The text with every finding replaced by a short mask, for a safe copy. */
export function maskText(text: string, findings: PrivacyFinding[]): string {
  let out = text;
  for (const f of findings) out = out.split(f.value).join(`[${PRIVACY_NOUN[f.kind]} hidden]`);
  return out;
}
