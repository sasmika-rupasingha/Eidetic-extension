/**
 * Website monitoring (D6, D22): the text of a chosen part of a page, fetched again on a schedule and compared.
 * Pages are parsed with DOMParser (no scripts run). Records live in the IndexedDB "monitors" store.
 */
import { changeLine, summarizeChanges, type ChangeSummary } from '../compare/changes';
import { newId, siteOf } from '../store/captures';
import { deleteRecord, getRecord, listRecords, putRecord, updateRecord } from '../store/records';

export const INTERVALS: Array<[number, string]> = [
  [15, 'Every 15 minutes'],
  [60, 'Every hour'],
  [360, 'Every 6 hours'],
  [1440, 'Once a day'],
];

export type MonitorStatus = 'ok' | 'not-found' | 'error' | 'needs-permission' | 'new';

export interface MonitorChange {
  at: number;
  summary: ChangeSummary;
  line: string;
}

export interface Monitor {
  id: string;
  url: string;
  title: string;
  site: string;
  selector: string;
  text: string;
  intervalMin: number;
  createdAt: number;
  lastCheckedAt: number;
  lastChangedAt: number;
  status: MonitorStatus;
  error?: string;
  /** Newest last; the last 20 are kept. */
  changes: MonitorChange[];
  /** Changes the user hasn't seen yet (the badge). */
  unread: number;
}

/** Text of an element with line breaks where blocks and <br> are, without running anything (works on DOMParser docs). */
export function elementText(el: Element): string {
  const BLOCK = /^(P|DIV|LI|TR|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|TABLE|TBODY|THEAD|DT|DD|PRE|BLOCKQUOTE|FIGCAPTION|MAIN|ASIDE|NAV|FORM|FIELDSET)$/;
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === 3) out += n.nodeValue ?? '';
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG)$/i.test(e.tagName)) return;
      if (e.tagName === 'BR') return void (out += '\n');
      const block = BLOCK.test(e.tagName);
      if (block) out += '\n';
      for (const c of Array.from(e.childNodes)) walk(c);
      if (e.tagName === 'TD' || e.tagName === 'TH') out += '\t';
      if (block) out += '\n';
    }
  };
  walk(el);
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** The watched text from a fetched page, or null when the part isn't in the page's HTML. */
export function extractText(html: string, selector: string, parse: (html: string) => Document = (h) => new DOMParser().parseFromString(h, 'text/html')): string | null {
  const doc = parse(html);
  let el: Element | null = null;
  try {
    el = doc.querySelector(selector);
  } catch {
    return null;
  }
  return el ? elementText(el) : null;
}

/** The same normalisation for text read from the live page (innerText), so both compare equal. */
export const normaliseText = (t: string) =>
  t
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

/** The monitor after one check: text found (compared with the last), not found, or an error. Pure. */
export function applyCheck(m: Monitor, result: { text: string } | { notFound: true } | { error: string; permission?: boolean }, now = Date.now()): { next: Monitor; changed: boolean } {
  const next: Monitor = { ...m, lastCheckedAt: now };
  delete next.error;
  if ('error' in result) return { next: { ...next, status: result.permission ? 'needs-permission' : 'error', error: result.error }, changed: false };
  if ('notFound' in result) return { next: { ...next, status: 'not-found' }, changed: false };
  const text = normaliseText(result.text);
  next.status = 'ok';
  const summary = summarizeChanges(m.text, text);
  if (summary.same) return { next, changed: false };
  next.text = text;
  next.lastChangedAt = now;
  next.changes = [...m.changes, { at: now, summary, line: changeLine(summary) }].slice(-20);
  next.unread = m.unread + 1;
  return { next, changed: true };
}

export const isDue = (m: Monitor, now = Date.now()) => m.status !== 'needs-permission' && now - m.lastCheckedAt >= m.intervalMin * 60_000 - 30_000;

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.protocol}//${u.hostname}/*` : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function validateMonitor(raw: unknown): Monitor | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 80) return null;
  const url = str(r.url, 2000);
  const selector = str(r.selector, 1000).trim();
  if (!originOf(url) || !selector) return null;
  const changes = (Array.isArray(r.changes) ? r.changes : [])
    .filter((c): c is MonitorChange => Boolean(c) && typeof c.at === 'number' && typeof c.line === 'string' && Boolean(c.summary) && typeof c.summary === 'object')
    .map((c) => {
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 500)).slice(0, 100) : []);
      const s = c.summary as unknown as Record<string, unknown>;
      const pairs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x.from === 'string' && typeof x.to === 'string').slice(0, 100) : []);
      return {
        at: c.at,
        line: c.line.slice(0, 200),
        summary: { added: list(s.added), removed: list(s.removed), changed: pairs(s.changed).map((x) => ({ from: String(x.from).slice(0, 500), to: String(x.to).slice(0, 500) })), numbers: pairs(s.numbers).map((x) => ({ label: str(x.label, 80), from: String(x.from).slice(0, 40), to: String(x.to).slice(0, 40) })), same: Boolean(s.same) },
      };
    })
    .slice(-20);
  const status = (['ok', 'not-found', 'error', 'needs-permission', 'new'] as const).find((x) => x === r.status) ?? 'new';
  return {
    id: r.id,
    url,
    title: str(r.title, 300),
    site: siteOf(url),
    selector,
    text: str(r.text, 20000),
    intervalMin: INTERVALS.some(([m]) => m === r.intervalMin) ? (r.intervalMin as number) : 60,
    createdAt: num(r.createdAt, Date.now()),
    lastCheckedAt: num(r.lastCheckedAt),
    lastChangedAt: num(r.lastChangedAt),
    status,
    ...(typeof r.error === 'string' ? { error: r.error.slice(0, 300) } : {}),
    changes,
    unread: Math.max(0, Math.round(num(r.unread))),
  };
}

export async function listMonitors(): Promise<Monitor[]> {
  return (await listRecords<unknown>('monitors')).map(validateMonitor).filter((m): m is Monitor => Boolean(m)).sort((a, b) => b.createdAt - a.createdAt);
}

export const getMonitor = async (id: string) => validateMonitor(await getRecord('monitors', id)) ?? undefined;

export async function createMonitor(p: { url: string; title: string; selector: string; text: string }, now = Date.now()): Promise<Monitor> {
  const m = validateMonitor({ id: `mon-${newId()}`, ...p, text: normaliseText(p.text), intervalMin: 60, createdAt: now, lastCheckedAt: now, lastChangedAt: 0, status: 'ok', changes: [], unread: 0 });
  if (!m) throw new Error('This page can’t be watched (only http and https pages can).');
  return putRecord('monitors', m);
}

export const saveMonitor = (m: Monitor) => putRecord('monitors', m);
export const editMonitor = (id: string, change: (m: Monitor) => Monitor | void) => updateRecord<Monitor>('monitors', id, change);
export const deleteMonitor = (id: string) => deleteRecord('monitors', id);
export const unreadTotal = (list: Monitor[]) => list.reduce((s, m) => s + m.unread, 0);
