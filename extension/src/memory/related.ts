/**
 * Visual Memory: links between captures, found by rules on this computer (no AI, no network).
 * Rules: same video, same page close in time, same site in one sitting, shared keywords/topics, strong text overlap
 * (word shingles), the same kind with the same key details (e.g. the same error), and, when both captures have
 * embeddings from the same local model, similar meaning. Each link keeps a short human reason.
 */
import { cosine } from '../search/semantic';
import type { Capture } from '../store/captures';

export interface Link {
  id: string;
  score: number;
  reason: string;
}

/** A link is made from this score up. */
export const LINK_THRESHOLD = 3;
/** Links kept per capture (the result view shows the first 5). */
export const MAX_LINKS = 8;

const MIN = 60_000;

/** "4 min later", "2 h earlier", "3 days later" — `b` relative to `a`. */
export function when(a: number, b: number): string {
  const d = b - a;
  const abs = Math.abs(d);
  const dir = d >= 0 ? 'later' : 'earlier';
  if (abs < MIN) return 'moments apart';
  if (abs < 60 * MIN) return `${Math.round(abs / MIN)} min ${dir}`;
  if (abs < 48 * 60 * MIN) return `${Math.round(abs / (60 * MIN))} h ${dir}`;
  return `${Math.round(abs / (24 * 60 * MIN))} days ${dir}`;
}

export const pageKey = (url: string) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    // YouTube keeps the video in ?v=, so the query matters there; elsewhere ignore tracking-style queries.
    const v = u.hostname.endsWith('youtube.com') ? u.searchParams.get('v') : null;
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${v ? `?v=${v}` : ''}`;
  } catch {
    return '';
  }
};

export const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];

/** Overlapping 3-word pieces of a text, for near-duplicate text detection. */
export function shingles(text: string, n = 3): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  if (w.length < n) {
    if (w.length) out.add(w.join(' '));
    return out;
  }
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) both += 1;
  return both / (a.size + b.size - both);
}

const tags = (c: Capture) => new Set([...(c.ai.topics ?? []), ...(c.ai.keywords ?? [])].map((t) => t.toLowerCase().trim()).filter(Boolean));

/** The details that make two captures of the same kind "the same thing". */
function keyDetails(c: Capture): string[] {
  const d = c.detection;
  if (!d) return [];
  const out: string[] = [];
  if (d.error) out.push(`error:${d.error.type}:${d.error.message.toLowerCase().slice(0, 120)}`);
  if (d.event) out.push(`event:${d.event.title.toLowerCase()}:${d.event.date ?? ''}`);
  for (const e of d.entities) if (e.type === 'url' || e.type === 'email' || e.type === 'phone') out.push(`${e.type}:${e.normalized}`);
  if (d.qr) out.push(`qr:${d.qr}`);
  return out;
}

const DETAIL_NOUN: Record<string, string> = { error: 'error', event: 'event', url: 'link', email: 'email address', phone: 'phone number', qr: 'QR code' };

interface Prepared {
  c: Capture;
  sh: Set<string>;
  tags: Set<string>;
  details: string[];
  page: string;
}

export const prepare = (c: Capture): Prepared => ({ c, sh: shingles(c.ocr?.text ?? ''), tags: tags(c), details: keyDetails(c), page: pageKey(c.source.url) });

/** How strongly `b` relates to `a`, and why (from `a`'s point of view). Null when it isn't related. */
export function relate(pa: Prepared, pb: Prepared): Link | null {
  const a = pa.c;
  const b = pb.c;
  if (a.id === b.id) return null;
  const found: Array<[number, string]> = [];
  const gap = Math.abs(a.createdAt - b.createdAt);
  // Same video
  if (a.video && b.video && pageKey(a.video.url) && pageKey(a.video.url) === pageKey(b.video.url)) {
    const dt = b.video.time - a.video.time;
    const m = Math.round(Math.abs(dt) / 60);
    found.push([5, Math.abs(dt) < 60 ? 'Same video, same moment' : `Same video, ${m} min ${dt > 0 ? 'later' : 'earlier'} in it`]);
  } else if (pa.page && pa.page === pb.page) {
    // Same page: strong when close in time, weaker otherwise.
    found.push(gap <= 6 * 60 * MIN ? [4, `Same page, ${when(a.createdAt, b.createdAt)}`] : [2, `Same page (${b.source.site})`]);
  } else if (a.source.site && a.source.site === b.source.site && !['Clipboard', 'File', 'Eidetic'].includes(a.source.site) && gap <= 30 * MIN) {
    found.push([1.5, `Same site, ${when(a.createdAt, b.createdAt)}`]);
  }
  // Shared keywords / topics
  const shared = [...pa.tags].filter((t) => pb.tags.has(t));
  if (shared.length) found.push([Math.min(4, 1.5 * shared.length), `Shared topic: ${shared.slice(0, 2).join(', ')}`]);
  // Text overlap
  const j = jaccard(pa.sh, pb.sh);
  if (j >= 0.25 && pa.sh.size >= 3 && pb.sh.size >= 3) found.push([2 + 4 * j, j >= 0.85 ? 'Almost the same text' : `Similar text (${Math.round(j * 100)}% overlap)`]);
  // Same kind with the same key detail
  if (a.detection && b.detection && a.detection.category === b.detection.category) {
    const same = pa.details.find((d) => pb.details.includes(d));
    if (same) {
      const kind = same.split(':')[0]!;
      found.push([kind === 'error' || kind === 'event' ? 4 : 3, kind === 'error' ? `Same error: ${b.detection.error?.type ?? 'error'}` : `Same ${DETAIL_NOUN[kind] ?? 'details'}`]);
    }
  }
  // Similar meaning (local embeddings from the same model)
  if (a.embedding && b.embedding && a.embedding.model === b.embedding.model) {
    const s = cosine(a.embedding.vector, b.embedding.vector);
    if (s >= 0.8) found.push([3 + 6 * (s - 0.8), `Similar in meaning (${Math.round(s * 100)}%)`]);
  }
  if (!found.length) return null;
  const score = found.reduce((s, [v]) => s + v, 0);
  if (score < LINK_THRESHOLD) return null;
  // The reason: where/when first (the first rule found is the page/video context, if any), then the strongest other one.
  const context = /^Same (video|page|site)/.test(found[0]![1]) ? found[0]! : null;
  const rest = found.filter((f) => f !== context).sort((x, y) => y[0] - x[0]);
  const parts = context ? [context, ...rest.slice(0, 1)] : rest.slice(0, 2);
  return { id: b.id, score, reason: parts.map(([, r]) => r).join(' · ') };
}

/** The strongest links from `target` to the other captures, best first. */
export function findRelated(target: Capture, others: Capture[], max = MAX_LINKS): Link[] {
  const pt = prepare(target);
  const out: Link[] = [];
  for (const o of others) {
    if (o.id === target.id || o.processing !== 'done') continue;
    const l = relate(pt, prepare(o));
    if (l) out.push(l);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, max);
}

type Relations = Capture['relations'];

/**
 * Merges freshly found rule links into a capture's relations: removed links stay removed (never recreated), links
 * by the user or AI stay, rule links are replaced by the new ones.
 */
export function mergeRelations(current: Relations, found: Link[]): Relations {
  const removed = new Set(current.filter((r) => r.removed).map((r) => r.id));
  const kept = current.filter((r) => r.removed || r.by !== 'rules');
  const keptIds = new Set(kept.map((r) => r.id));
  const fresh = found.filter((l) => !removed.has(l.id) && !keptIds.has(l.id)).map((l) => ({ id: l.id, reason: l.reason, by: 'rules' as const }));
  return [...kept.filter((r) => !r.removed), ...fresh].slice(0, MAX_LINKS).concat(kept.filter((r) => r.removed));
}

/** Visible links: not removed, and the other capture still exists. */
export function visibleRelations(c: Capture, exists: (id: string) => boolean): Relations {
  return c.relations.filter((r) => !r.removed && exists(r.id));
}

/** Topics for the library filter: AI topics first, then keywords, by how many captures have them. */
export function topicCounts(caps: Capture[], max = 12): Array<[string, number]> {
  const n = new Map<string, number>();
  for (const c of caps) for (const t of tags(c)) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].filter(([, k]) => k >= 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
}

export const hasTopic = (c: Capture, topic: string) => tags(c).has(topic.toLowerCase());
