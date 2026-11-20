/**
 * Rules-first content detection. Works offline and without AI: each detector scores the recognised text and
 * extracts facts; the best score wins and its facts become a specific one-line description, e.g.
 * "Python error: the module ‘pandas’ isn’t installed". AI can later refine the description (labelled as such).
 */
import { extractEntities, type Entity } from './entities';
import { detectTable, type OcrLine } from './table';

export type Category =
  | 'error' | 'code' | 'math' | 'table' | 'qr' | 'event' | 'contact' | 'receipt' | 'job' | 'product'
  | 'research' | 'question' | 'slide' | 'text' | 'image';

export const CATEGORY_LABEL: Record<Category, string> = {
  error: 'Programming error', code: 'Code', math: 'Equation', table: 'Table', qr: 'QR code', event: 'Event', contact: 'Contact',
  receipt: 'Receipt', job: 'Job advertisement', product: 'Product', research: 'Research', question: 'Question', slide: 'Slide',
  text: 'Text', image: 'Image',
};

export interface ErrorInfo {
  language: string;
  type: string;
  message: string;
  module?: string;
}

export interface EventInfo {
  title: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM (24 h)
  place?: string;
}

export interface ReceiptInfo {
  items: Array<{ name: string; amount: string }>;
  total?: string;
}

export interface Detection {
  category: Category;
  /** Short label for the category line, e.g. "Programming error · Python". */
  label: string;
  /** One specific sentence about what this capture is. */
  description: string;
  confidence: number;
  by: 'rules' | 'ai';
  entities: Entity[];
  table?: string[][];
  code?: { language: string; text: string };
  error?: ErrorInfo;
  math?: { expression: string };
  event?: EventInfo;
  receipt?: ReceiptInfo;
  qr?: string;
}

export interface DetectInput {
  text: string;
  lines?: OcrLine[];
  qr?: string | null;
  source?: { title?: string; site?: string };
}

const words = (t: string) => t.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
const nonEmptyLines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const quote = (t: string) => `‘${t}’`;

/* ------------------------------------------------------------------ errors */

export function detectError(text: string): ErrorInfo | null {
  let m: RegExpExecArray | null;
  if ((m = /No module named ['"]?([\w.]+)['"]?/.exec(text))) return { language: 'Python', type: 'ModuleNotFoundError', message: `No module named '${m[1]}'`, module: m[1]!.split('.')[0] };
  const pyTrace = /Traceback \(most recent call last\)/.test(text) || /File ".+", line \d+/.test(text);
  if ((m = /^\s*([A-Z]\w*(?:Error|Exception|Warning|Interrupt|Exit))(?::\s*(.*))?$/m.exec(text)) && (pyTrace || /Error:|Exception:/.test(m[0]))) {
    if (pyTrace) return { language: 'Python', type: m[1]!, message: (m[2] ?? '').trim() };
  }
  if ((m = /ERROR: Could not find a version that satisfies the requirement ([\w.-]+)/.exec(text))) return { language: 'Python', type: 'pip', message: m[0], module: m[1] };
  if ((m = /Cannot find module ['"]([^'"]+)['"]/.exec(text))) return { language: 'JavaScript', type: 'Error', message: `Cannot find module '${m[1]}'`, module: m[1] };
  if ((m = /npm (?:ERR!|error) code (\w+)/.exec(text))) return { language: 'npm', type: m[1]!, message: (/npm (?:ERR!|error) (?!code)(.+)/.exec(text)?.[1] ?? m[0]).trim() };
  if ((m = /error (TS\d{4}):\s*(.+)/.exec(text))) return { language: 'TypeScript', type: m[1]!, message: m[2]!.trim() };
  if ((m = /Exception in thread "[^"]+" ([\w.$]+(?:Exception|Error))(?::\s*(.*))?/.exec(text)) || ((m = /\b(java\.[\w.]+(?:Exception|Error))(?::\s*(.*))?/.exec(text)) && /\bat [\w.$]+\(\w+\.java:\d+\)/.test(text)))
    return { language: 'Java', type: m[1]!.split('.').pop()!, message: (m[2] ?? '').trim() };
  if ((m = /\b(System\.[\w.]+Exception)(?::\s*(.*))?/.exec(text))) return { language: 'C#', type: m[1]!.split('.').pop()!, message: (m[2] ?? '').trim() };
  if ((m = /(?:PHP )?(Fatal error|Parse error|Warning):\s*(.+?) in (\S+) on line (\d+)/.exec(text))) return { language: 'PHP', type: m[1]!, message: m[2]!.trim() };
  if ((m = /(ERROR \d{4} \([\w\d]+\)|SQLSTATE\[[\w\d]+\]|ORA-\d{5})[:\s]*(.*)/.exec(text))) return { language: 'SQL', type: m[1]!, message: (m[2] ?? '').trim() };
  if ((m = /(?:Uncaught\s+(?:\(in promise\)\s+)?)?\b(TypeError|ReferenceError|SyntaxError|RangeError|Error):\s*(.+)/.exec(text)) && (/\n\s*at\s+\S/.test(text) || /Uncaught/.test(text) || /\.(js|ts|tsx|jsx|mjs)\b/.test(text)))
    return { language: /\.tsx?\b|TS\d{4}/.test(text) ? 'TypeScript' : 'JavaScript', type: m[1]!, message: m[2]!.trim() };
  if ((m = /(?:^|\n)\s*(?:error|fatal error)(?:\[E\d+\])?:\s*(.+)/i.exec(text)) && /\.(c|cpp|h|rs|go|swift|kt):\d+|-->|cargo|rustc|gcc|clang/.test(text))
    return { language: /rustc|cargo|-->/.test(text) ? 'Rust' : /\.go:\d+/.test(text) ? 'Go' : 'C/C++', type: 'error', message: m[1]!.trim() };
  return null;
}

export function describeError(e: ErrorInfo): string {
  if (e.type === 'ModuleNotFoundError' && e.module) return `Python error: the module ${quote(e.module)} isn’t installed in this environment`;
  if (e.type === 'pip' && e.module) return `pip error: no installable version of ${quote(e.module)} was found`;
  if (e.language === 'JavaScript' && e.module) return `Node.js error: the module ${quote(e.module)} can’t be found`;
  if (e.language === 'npm') return `npm error ${e.type}: ${clip(e.message, 90)}`;
  return `${e.language} error: ${e.type}${e.message ? ` — ${clip(e.message, 100)}` : ''}`;
}

/* ------------------------------------------------------------------ code */

const LANG_HINTS: Array<[string, RegExp]> = [
  ['Python', /^\s*(def |class \w+(\(.*\))?:|import \w|from \w+ import|elif |print\(|self\.)/m],
  ['TypeScript', /:\s*(string|number|boolean|void)\b|interface \w+ \{|<\w+>\(|as const\b/],
  ['JavaScript', /\b(const|let|var) \w+ =|=>|function \w*\(|console\.log|require\(|export (default )?/],
  ['Java', /\b(public|private|protected) (static )?(class|void|int|String)\b|System\.out\.println/],
  ['C#', /\busing System;|Console\.WriteLine|namespace \w+/],
  ['C/C++', /#include\s*<|std::|printf\(|int main\(/],
  ['SQL', /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE)\b[\s\S]*\b(FROM|VALUES|SET|WHERE|\()/i],
  ['HTML', /<\/?(div|span|html|body|head|script|a|p|ul|li)\b[^>]*>/i],
  ['CSS', /^[.#]?[\w-]+\s*\{[^}]*:[^}]*;/m],
  ['Shell', /^\s*(\$ |sudo |cd |ls |mkdir |npm |pip |git |docker |curl )/m],
  ['PHP', /<\?php|\$\w+\s*=|->\w+\(/],
  ['Go', /\bfunc \w+\(|package main|:= /],
  ['Rust', /\bfn \w+\(|let mut |impl |println!/],
];

export function codeScore(text: string): { score: number; language: string } {
  const lines = nonEmptyLines(text);
  if (lines.length < 2) return { score: 0, language: '' };
  const symbolLines = lines.filter((l) => /[;{}()[\]=<>]|=>|::|\b(def|return|import|class|function|const|let|var|if|for|while)\b/.test(l)).length;
  const endings = lines.filter((l) => /[;{}:,)]$/.test(l)).length;
  const indented = text.split('\n').filter((l) => /^( {2,}|\t)\S/.test(l)).length;
  let language = '';
  for (const [name, re] of LANG_HINTS) if (re.test(text)) {
    language = name;
    break;
  }
  const ratio = symbolLines / lines.length;
  let score = ratio * 0.6 + (endings / lines.length) * 0.25 + Math.min(indented / lines.length, 1) * 0.15;
  if (language) score += 0.2;
  // Prose with an occasional bracket is not code.
  const avgWords = words(text).length / lines.length;
  if (avgWords > 14 && ratio < 0.6) score -= 0.3;
  return { score: Math.max(0, Math.min(1, score)), language: language || 'Code' };
}

/* ------------------------------------------------------------------ maths */

export function mathScore(text: string): { score: number; expression: string } {
  const lines = nonEmptyLines(text);
  if (!lines.length) return { score: 0, expression: '' };
  const mathLines = lines.filter((l) => {
    const ops = (l.match(/[=+\-−×÷*/^√∑∫∏≤≥≈≠±πθλμσΔ∞]|\b(sin|cos|tan|log|ln|lim|exp)\b/g) ?? []).length;
    const letters = (l.match(/[a-z]{4,}/gi) ?? []).filter((w) => !/^(sin|cos|tan|log|lim|exp|sqrt)$/i.test(w)).length;
    return ops >= 2 && letters <= 3 && /[=≤≥≈<>]|∫|∑/.test(l);
  });
  if (!mathLines.length) return { score: 0, expression: '' };
  const score = Math.min(1, (mathLines.length / lines.length) * 0.9 + 0.15);
  return { score, expression: mathLines.slice(0, 3).join('\n') };
}

/* ------------------------------------------------------------------ events, receipts and others */

const TIME_RE = /(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])|\b([01]?\d|2[0-3]):([0-5]\d)\b/i;
const MONEY_RE = /(?:(?:Rs\.?|LKR|USD|US\$|\$|€|£|₹|¥)\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*\.\d{2}\b)/gi;

export function parseTime(text: string): string | undefined {
  const m = TIME_RE.exec(text);
  if (!m) return undefined;
  if (m[1]) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3]!)) h += 12;
    return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  }
  return `${m[4]!.padStart(2, '0')}:${m[5]}`;
}

function titleLine(lines: string[]): string {
  const cand = lines.slice(0, 4).filter((l) => /\p{L}{3,}/u.test(l) && l.length <= 80 && !/^(date|time|venue|location|where|when)\b/i.test(l));
  return cand.sort((a, b) => words(b).length - words(a).length)[0] ?? lines[0] ?? '';
}

function eventInfo(text: string, entities: Entity[]): EventInfo | null {
  const date = entities.find((e) => e.type === 'date')?.normalized;
  const time = parseTime(text);
  const venue = /\b(venue|location|hall|auditorium|room|theatre|theater|stadium|online|zoom|webinar|workshop|conference|seminar|concert|festival|meetup|lecture|exhibition|register|tickets?|join us)\b/i.test(text);
  if (!date || (!time && !venue)) return null;
  const lines = nonEmptyLines(text);
  const placeLine = lines.find((l) => /^(venue|location|where|at)\b[:\s]/i.test(l)) ?? lines.find((l) => /\b(hall|auditorium|room \w+|theatre|stadium|campus|zoom|online)\b/i.test(l));
  return { title: clip(titleLine(lines), 70), date, time, place: placeLine ? clip(placeLine.replace(/^(venue|location|where|at)\s*[:\-–]?\s*/i, ''), 60) : undefined };
}

function receiptInfo(text: string): ReceiptInfo | null {
  const lines = nonEmptyLines(text);
  const priced = lines.filter((l) => /(\d[\d,]*\.\d{2}|Rs\.?\s?\d|\$\s?\d)\s*$/.test(l));
  if (priced.length < 3 || !/\b(total|subtotal|amount due|balance|tax|vat|cash|change|receipt|invoice|bill)\b/i.test(text)) return null;
  const items: ReceiptInfo['items'] = [];
  let total: string | undefined;
  for (const l of priced) {
    const amount = /(\d[\d,]*(?:\.\d{2})?)\s*$/.exec(l)?.[1] ?? '';
    const name = l.replace(/(Rs\.?|LKR|\$|€|£)?\s*\d[\d,]*(?:\.\d{2})?\s*$/i, '').replace(/[.:\-–\s]+$/, '').trim();
    if (/\b(grand )?total|amount due|balance due\b/i.test(name)) total = amount;
    else if (!/\b(subtotal|tax|vat|cash|change|discount|tip|service)\b/i.test(name) && name) items.push({ name: clip(name, 60), amount });
  }
  return { items, total };
}

const JOB_WORDS = /\b(responsibilities|requirements|qualifications?|experience|apply|applicants?|we are (looking|hiring)|job|role|position|salary|full[- ]time|part[- ]time|internship|intern|remote|hybrid|vacanc(y|ies)|candidate|benefits|skills)\b/gi;
const PRODUCT_WORDS = /\b(ram|storage|ssd|hdd|processor|cpu|gpu|display|screen|battery|weight|camera|warranty|model|ghz|mah|inch|resolution|ports?|os)\b|\b\d+\s?(gb|tb|ghz|mah|mp|hz|w|kg|g)\b|["”]/gi;
const RESEARCH_WORDS = /\b(abstract|introduction|methodology|methods|results|discussion|conclusions?|related work|et al\.|doi|arxiv|references|dataset|baseline|accuracy|we propose|our approach|experiments?)\b|\[\d+(?:,\s*\d+)*\]/gi;

const distinct = (text: string, re: RegExp) => new Set((text.match(re) ?? []).map((w) => w.toLowerCase())).size;

/* ------------------------------------------------------------------ classify */

export function classify(input: DetectInput): Detection {
  const text = input.text ?? '';
  const lines = nonEmptyLines(text);
  const entities = extractEntities(text);
  const n = words(text).length;
  const base = { by: 'rules' as const, entities };

  // QR codes are certain when the reader found one.
  if (input.qr) {
    let description = 'QR code with text';
    try {
      const u = new URL(input.qr);
      description = `QR code linking to ${u.hostname.replace(/^www\./, '')}`;
    } catch {
      description = `QR code: ${clip(input.qr, 60)}`;
    }
    return { ...base, category: 'qr', label: CATEGORY_LABEL.qr, description, confidence: 0.99, qr: input.qr };
  }
  if (n < 3) return { ...base, category: 'image', label: CATEGORY_LABEL.image, description: n ? `Image with a little text: “${clip(text.trim(), 50)}”` : 'Image with no readable text', confidence: 0.6 };

  const err = detectError(text);
  if (err) return { ...base, category: 'error', label: `${CATEGORY_LABEL.error} · ${err.language}`, description: describeError(err), confidence: 0.92, error: err };

  type Scored = { score: number; build: () => Detection };
  const scored: Scored[] = [];

  const table = input.lines ? detectTable(input.lines) : null;
  if (table && table.length >= 3 && (table[0]?.length ?? 0) >= 2) {
    const head = table[0]!.filter(Boolean).slice(0, 4).join(', ');
    scored.push({ score: 0.8, build: () => ({ ...base, category: 'table', label: `${CATEGORY_LABEL.table} · ${table.length} × ${table[0]!.length}`, description: `Table of ${table.length - 1} rows: ${clip(head, 70)}`, confidence: 0.8, table }) });
  }

  const code = codeScore(text);
  if (code.score >= 0.55)
    scored.push({ score: code.score, build: () => ({ ...base, category: 'code', label: `${CATEGORY_LABEL.code} · ${code.language}`, description: `${code.language} code, ${lines.length} lines${/^\s*(def|function|class|public)\b/m.exec(text) ? ` defining ${quote(/\b(?:def|function|class)\s+(\w+)/.exec(text)?.[1] ?? 'a function')}` : ''}`, confidence: code.score, code: { language: code.language, text } }) });

  const math = mathScore(text);
  if (math.score >= 0.5) scored.push({ score: math.score, build: () => ({ ...base, category: 'math', label: CATEGORY_LABEL.math, description: `Equation: ${clip(math.expression.split('\n')[0]!, 80)}`, confidence: math.score, math: { expression: math.expression } }) });

  const ev = eventInfo(text, entities);
  if (ev) scored.push({ score: 0.78, build: () => ({ ...base, category: 'event', label: CATEGORY_LABEL.event, description: `Event: ${ev.title}${ev.date ? ` on ${ev.date}` : ''}${ev.time ? ` at ${ev.time}` : ''}`, confidence: 0.78, event: ev }) });

  const rc = receiptInfo(text);
  if (rc) scored.push({ score: 0.8, build: () => ({ ...base, category: 'receipt', label: CATEGORY_LABEL.receipt, description: `Receipt with ${rc.items.length} item${rc.items.length === 1 ? '' : 's'}${rc.total ? `, total ${rc.total}` : ''}`, confidence: 0.8, receipt: rc }) });

  const contacts = entities.filter((e) => e.type === 'email' || e.type === 'phone');
  if (contacts.length >= 2 && lines.length <= 12 && !ev)
    scored.push({ score: 0.7, build: () => ({ ...base, category: 'contact', label: CATEGORY_LABEL.contact, description: `Contact details${/\p{L}{2,} \p{L}{2,}/u.test(lines[0] ?? '') ? ` for ${clip(lines[0]!, 50)}` : ''}`, confidence: 0.7 }) });

  const job = distinct(text, JOB_WORDS);
  if (job >= 4) scored.push({ score: Math.min(0.9, 0.5 + job * 0.06), build: () => ({ ...base, category: 'job', label: CATEGORY_LABEL.job, description: `Job advertisement: ${clip(titleLine(lines), 70)}`, confidence: 0.75 }) });

  const prices = (text.match(MONEY_RE) ?? []).length;
  const prod = distinct(text, PRODUCT_WORDS);
  if (prod >= 4 && (prices >= 1 || prod >= 6))
    scored.push({ score: Math.min(0.85, 0.45 + prod * 0.06), build: () => ({ ...base, category: 'product', label: CATEGORY_LABEL.product, description: `Product specifications: ${clip(titleLine(lines), 70)}`, confidence: 0.7 }) });

  const research = distinct(text, RESEARCH_WORDS);
  if (research >= 3) scored.push({ score: Math.min(0.85, 0.4 + research * 0.08), build: () => ({ ...base, category: 'research', label: CATEGORY_LABEL.research, description: `Research text: ${clip(titleLine(lines), 70)}`, confidence: 0.7 }) });

  const asks = /\?\s*$/m.test(text) || /^\s*(Q\d+|Question\s*\d+|\(?[a-d]\)|\(?i{1,3}\))/im.test(text) || /^\s*(find|calculate|compute|prove|show that|explain why|derive|determine|what is|how many|solve)\b/im.test(text);
  if (asks && n <= 160) scored.push({ score: 0.62, build: () => ({ ...base, category: 'question', label: CATEGORY_LABEL.question, description: `Question: ${clip((lines.find((l) => l.endsWith('?')) ?? lines[0] ?? '').replace(/^(Q\d+|Question\s*\d+)[.:)]?\s*/i, ''), 90)}`, confidence: 0.62 }) });

  const bullets = lines.filter((l) => /^([•▪◦●○■□➤►\-–*]|\d+[.)])\s+/.test(l)).length;
  const first = lines[0] ?? '';
  if (lines.length >= 3 && lines.length <= 18 && words(first).length <= 9 && (bullets >= 2 || lines.slice(1).every((l) => words(l).length <= 16)))
    scored.push({ score: bullets >= 2 ? 0.6 : 0.45, build: () => ({ ...base, category: 'slide', label: CATEGORY_LABEL.slide, description: `Slide: ${clip(first.replace(/^[•▪\-–*\d.)\s]+/, ''), 80)}`, confidence: 0.6 }) });

  scored.sort((a, b) => b.score - a.score);
  if (scored[0]) return scored[0].build();
  const firstSentence = (/^[^.!?\n]{8,}[.!?]/.exec(text.trim())?.[0] ?? lines[0] ?? '').trim();
  return { ...base, category: 'text', label: CATEGORY_LABEL.text, description: `${n} words of text: “${clip(firstSentence, 70)}”`, confidence: 0.5 };
}
