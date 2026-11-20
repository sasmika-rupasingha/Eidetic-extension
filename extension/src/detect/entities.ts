/** Finds things worth acting on in recognised text: links, emails, phone numbers and dates. */

export type EntityType = 'url' | 'email' | 'phone' | 'date';

export interface Entity {
  type: EntityType;
  /** The text as it appears. */
  value: string;
  /** Machine form: absolute URL, bare email, E.164-ish phone (+94771234567), or YYYY-MM-DD. */
  normalized: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+[^\s<>"'().,;:!?]/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// +94 77 123 4567 · 077-123 4567 · (011) 234 5678 · +1 (415) 555-0100
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/g;
const ISO_DATE_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
const DMY_RE = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
const D_MON_Y_RE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s+(\d{4})\b/gi;
const MON_D_Y_RE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31 Feb etc.
  return `${y}-${pad(m)}-${pad(d)}`;
}

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

export function extractEntities(text: string): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const add = (type: EntityType, value: string, normalized: string, start: number) => {
    const key = `${type}:${normalized}`;
    taken.push([start, start + value.length]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type, value, normalized });
  };

  for (const m of text.matchAll(EMAIL_RE)) add('email', m[0], m[0].toLowerCase(), m.index);
  for (const m of text.matchAll(URL_RE)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const url = m[0].toLowerCase().startsWith('www.') ? `https://${m[0]}` : m[0];
    try {
      add('url', m[0], new URL(url).href, m.index);
    } catch {
      /* not a URL after all */
    }
  }

  for (const re of [ISO_DATE_RE, DMY_RE, D_MON_Y_RE, MON_D_Y_RE]) {
    for (const m of text.matchAll(re)) {
      if (overlaps(m.index, m.index + m[0].length)) continue;
      let iso: string | null = null;
      if (re === ISO_DATE_RE) iso = validDate(+m[1]!, +m[2]!, +m[3]!);
      else if (re === DMY_RE) iso = validDate(+m[3]!, +m[2]!, +m[1]!); // day first (Sri Lanka, UK, most of the world)
      else if (re === D_MON_Y_RE) iso = validDate(+m[3]!, monthIndex(m[2]!), +m[1]!);
      else iso = validDate(+m[3]!, monthIndex(m[1]!), +m[2]!);
      if (iso) add('date', m[0], iso, m.index);
    }
  }

  for (const m of text.matchAll(PHONE_RE)) {
    const value = m[0].trim();
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    if (/^\d{4}$/.test(value)) continue;
    // Sri Lankan local numbers (0XX XXX XXXX) become +94; others keep their own + prefix or stay local.
    let normalized = value.startsWith('+') ? `+${digits}` : digits;
    if (!value.startsWith('+') && digits.length === 10 && digits.startsWith('0')) normalized = `+94${digits.slice(1)}`;
    add('phone', value, normalized, m.index);
  }
  return out;
}

/** Link to a Google Calendar "new event" page for a found date (all-day). */
export function calendarLink(title: string, isoDate: string): string {
  const d = isoDate.replace(/-/g, '');
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title.slice(0, 120))}&dates=${d}/${end}`;
}

export function entityHref(e: Entity): string {
  switch (e.type) {
    case 'url':
      return e.normalized;
    case 'email':
      return `mailto:${e.normalized}`;
    case 'phone':
      return `tel:${e.normalized}`;
    case 'date':
      return calendarLink('Event', e.normalized);
  }
}
