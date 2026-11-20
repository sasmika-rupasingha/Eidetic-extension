/** Local actions: they run without AI and without sending anything anywhere (except opening a link you chose). */
import type { Detection, EventInfo } from '../detect/classify';
import type { Entity } from '../detect/entities';
import { toCSV, toMarkdown, toTSV } from '../detect/table';
import { maskText, type PrivacyFinding } from '../privacy/detect';
import { searchUrl, type Settings } from '../store/settings';
import type { LocalActionId } from './registry';

export type LocalResult =
  | { kind: 'copy'; text: string; message: string }
  | { kind: 'open'; url: string; message: string }
  | { kind: 'download'; filename: string; blob: Blob; message: string }
  | { kind: 'speak'; text: string; message: string }
  | { kind: 'image'; message: string };

export interface LocalContext {
  text: string;
  detection: Detection;
  findings: PrivacyFinding[];
  settings: Settings;
  title: string;
  number: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Google Calendar "new event" link. With a time it is a one-hour event in local time; without, an all-day event. */
export function eventLink(ev: EventInfo, fallbackTitle = 'Event'): string | null {
  if (!ev.date) return null;
  const d = ev.date.replace(/-/g, '');
  let dates: string;
  if (ev.time) {
    const [h, m] = ev.time.split(':').map(Number) as [number, number];
    const endH = (h + 1) % 24;
    const endDate = h + 1 >= 24 ? nextDay(ev.date) : d;
    dates = `${d}T${pad(h)}${pad(m)}00/${endDate}T${pad(endH)}${pad(m)}00`;
  } else dates = `${d}/${nextDay(ev.date)}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: (ev.title || fallbackTitle).slice(0, 120), dates });
  if (ev.place) params.set('location', ev.place.slice(0, 120));
  params.set('details', 'Added with Eidetic');
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function nextDay(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, '');
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

/** A vCard 3.0 from the found emails and phone numbers; the first line that looks like a name becomes the name. */
export function vcard(text: string, entities: Entity[]): string {
  const name = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^\p{Lu}[\p{L}.'-]+(?: \p{Lu}[\p{L}.'-]+){1,3}$/u.test(l));
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(name ?? 'New contact')}`];
  for (const e of entities) {
    if (e.type === 'email') lines.push(`EMAIL;TYPE=INTERNET:${esc(e.normalized)}`);
    if (e.type === 'phone') lines.push(`TEL;TYPE=CELL:${esc(e.normalized)}`);
    if (e.type === 'url') lines.push(`URL:${esc(e.normalized)}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

const firstLink = (d: Detection) => d.qr && /^https?:\/\//i.test(d.qr) ? d.qr : d.entities.find((e) => e.type === 'url')?.normalized ?? null;

const fileBase = (ctx: LocalContext) => `eidetic-${String(ctx.number).padStart(4, '0')}`;

export function runLocal(id: LocalActionId, ctx: LocalContext): LocalResult {
  const d = ctx.detection;
  switch (id) {
    case 'copy-text':
      return { kind: 'copy', text: ctx.text, message: 'Text copied' };
    case 'copy-error': {
      const msg = d.error ? `${d.error.type}${d.error.message ? `: ${d.error.message}` : ''}` : ctx.text;
      return { kind: 'copy', text: msg, message: 'Error copied' };
    }
    case 'copy-code':
      return { kind: 'copy', text: d.code?.text ?? ctx.text, message: 'Code copied' };
    case 'copy-equation':
      return { kind: 'copy', text: d.math?.expression ?? ctx.text, message: 'Equation copied' };
    case 'copy-tsv':
      return d.table ? { kind: 'copy', text: toTSV(d.table), message: 'Table copied: paste it into Excel or Sheets' } : { kind: 'copy', text: ctx.text, message: 'Text copied' };
    case 'copy-markdown':
      return { kind: 'copy', text: d.table ? toMarkdown(d.table) : ctx.text, message: 'Markdown copied' };
    case 'download-csv': {
      const rows = d.table ?? (d.receipt ? [['Item', 'Amount'], ...d.receipt.items.map((i) => [i.name, i.amount]), ...(d.receipt.total ? [['Total', d.receipt.total]] : [])] : ctx.text.split('\n').map((l) => [l]));
      return { kind: 'download', filename: `${fileBase(ctx)}.csv`, blob: new Blob([`\ufeff${toCSV(rows)}`], { type: 'text/csv' }), message: 'CSV downloaded' };
    }
    case 'copy-items': {
      const rows = d.receipt ? [['Item', 'Amount'], ...d.receipt.items.map((i) => [i.name, i.amount]), ...(d.receipt.total ? [['Total', d.receipt.total]] : [])] : [];
      return { kind: 'copy', text: rows.length ? toTSV(rows) : ctx.text, message: 'Items copied: paste them into a spreadsheet' };
    }
    case 'add-calendar': {
      const ev: EventInfo = d.event ?? { title: ctx.title, date: d.entities.find((e) => e.type === 'date')?.normalized };
      const url = eventLink(ev, ctx.title);
      return url ? { kind: 'open', url, message: 'Opening Google Calendar' } : { kind: 'copy', text: ctx.text, message: 'No date found; text copied instead' };
    }
    case 'copy-details': {
      const ev = d.event;
      const text = ev ? [ev.title, ev.date && `Date: ${ev.date}`, ev.time && `Time: ${ev.time}`, ev.place && `Place: ${ev.place}`, ...d.entities.filter((e) => e.type === 'url').map((e) => e.normalized)].filter(Boolean).join('\n') : ctx.text;
      return { kind: 'copy', text, message: 'Details copied' };
    }
    case 'open-link': {
      const url = firstLink(d);
      return url ? { kind: 'open', url, message: `Opening ${safeHost(url)}` } : { kind: 'copy', text: d.qr ?? ctx.text, message: 'Copied' };
    }
    case 'copy-link':
      return { kind: 'copy', text: firstLink(d) ?? d.qr ?? ctx.text, message: 'Copied' };
    case 'copy-vcard':
      return { kind: 'download', filename: `${fileBase(ctx)}.vcf`, blob: new Blob([vcard(ctx.text, d.entities)], { type: 'text/vcard' }), message: 'Contact card downloaded: open it to add the contact' };
    case 'email': {
      const e = d.entities.find((x) => x.type === 'email');
      return e ? { kind: 'open', url: `mailto:${e.normalized}`, message: `Email ${e.normalized}` } : { kind: 'copy', text: ctx.text, message: 'Copied' };
    }
    case 'call': {
      const p = d.entities.find((x) => x.type === 'phone');
      return p ? { kind: 'open', url: `tel:${p.normalized}`, message: `Call ${p.normalized}` } : { kind: 'copy', text: ctx.text, message: 'Copied' };
    }
    case 'search-web': {
      const q = d.error ? `${d.error.type} ${d.error.message}`.trim() : ctx.text.replace(/\s+/g, ' ').slice(0, 300);
      return { kind: 'open', url: searchUrl(ctx.settings.searchEngine, q), message: 'Searching the web' };
    }
    case 'read-aloud':
      return { kind: 'speak', text: ctx.text, message: 'Reading aloud' };
    case 'safe-copy':
      return { kind: 'copy', text: maskText(ctx.text, ctx.findings), message: `Copied with ${ctx.findings.length} private detail${ctx.findings.length === 1 ? '' : 's'} hidden` };
    case 'download-image':
      return { kind: 'image', message: 'Image downloaded' };
  }
}

export function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}
