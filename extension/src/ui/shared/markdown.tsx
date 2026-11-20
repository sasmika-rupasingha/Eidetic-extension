/**
 * Markdown for AI answers, rendered as React elements (never as HTML strings), so model output can't inject markup
 * or scripts. Supports headings, paragraphs, lists, quotes, rules, bold, italic, inline code, safe links, fenced code
 * blocks (with a language label and their own Copy), pipe tables (with Copy as TSV) and maths.
 *
 * Maths: `$…$`, `\(…\)` inline and `$$…$$`, `\[…\]` as blocks. Temml turns the TeX into MathML; the MathML is parsed in
 * an inert document, filtered to MathML elements and harmless attributes, and only then adopted into the page.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import temml from 'temml';
import { IconCheck, IconCopy } from '../design/icons';

const SAFE_LINK = /^(https?:|mailto:)/i;
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/* ------------------------------------------------------------------ maths */

/** Renders TeX to a sanitised MathML element, or null if it can't be parsed. Exported for tests. */
export function texToMathElement(tex: string, display: boolean, doc: Document = document): Element | null {
  let markup: string;
  try {
    markup = temml.renderToString(tex, { displayMode: display, throwOnError: true, trust: false, maxExpand: 200 });
  } catch {
    return null;
  }
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${markup}`, 'text/html');
  const math = parsed.body.querySelector('math');
  if (!math || math.namespaceURI !== MATHML_NS) return null;
  for (const el of [math, ...Array.from(math.querySelectorAll('*'))]) {
    if (el.namespaceURI !== MATHML_NS) {
      el.remove();
      continue;
    }
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n.includes('href') || n.includes('src') || (n === 'style' && /url\s*\(|expression|@import/i.test(a.value))) el.removeAttribute(a.name);
    }
  }
  return doc.importNode(math, true);
}

function MathView({ tex, display }: { tex: string; display: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const el = texToMathElement(tex, display, host.ownerDocument);
    host.replaceChildren();
    if (el) {
      el.setAttribute('aria-label', tex);
      host.append(el);
      setFailed(false);
    } else setFailed(true);
  }, [tex, display]);
  if (failed) return <code className="math-src" title="Couldn't render this maths, showing the source">{tex}</code>;
  return <span ref={ref} className={display ? 'math-display' : 'math-inline'} data-tex={tex} />;
}

/* ------------------------------------------------------------------ copy button (local, so this file has no UI deps) */

export function CopyMini({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={`btn ghost small icon copy-mini ${done ? 'done' : ''} ${className}`}
      aria-label={done ? 'Copied' : label}
      data-tip={done ? 'Copied' : label}
      data-tip-pos="left"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setDone(true), () => undefined);
      }}
    >
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
}

/* ------------------------------------------------------------------ inline */

export function inline(text: string, keyBase = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  // code | bold | italic | link | \( math \) | $math$ (pandoc rule: no space inside the dollars, no digit right after)
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*|\b_[^_\n]+_\b)|(\[[^\]\n]+\]\([^)\s]+\))|(\\\(.+?\\\))|(\$\$[^$\n]+?\$\$|\$(?=[^\s$])[^$\n]*?[^\s$]\$(?!\d)|\$[^$\s]\$(?!\d))/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (m[1]) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{inline(t.slice(2, -2), key)}</strong>);
    else if (m[3]) out.push(<em key={key}>{inline(t.slice(1, -1), key)}</em>);
    else if (m[4]) {
      const label = t.slice(1, t.indexOf(']('));
      const href = t.slice(t.indexOf('](') + 2, -1);
      out.push(
        SAFE_LINK.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else if (m[5]) out.push(<MathView key={key} tex={t.slice(2, -2)} display={false} />);
    else if (m[6]) out.push(<MathView key={key} tex={t.startsWith('$$') ? t.slice(2, -2) : t.slice(1, -1)} display={false} />);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ------------------------------------------------------------------ blocks */

type Align = 'left' | 'center' | 'right' | null;
export type Block =
  | { kind: 'p' | 'h' | 'ul' | 'ol' | 'code' | 'quote' | 'hr' | 'math'; lines: string[]; level?: number; lang?: string }
  | { kind: 'table'; lines: string[]; head: string[]; rows: string[][]; align: Align[] };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const LIST = /^\s*([-*•]|\d+[.)])\s+/;

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      i++; // closing fence (or end while streaming)
      blocks.push({ kind: 'code', lines: body, lang });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    // display maths: $$ … $$ or \[ … \], on one line or several
    const mOpen = /^\s*(\$\$|\\\[)/.exec(line);
    if (mOpen) {
      const close = mOpen[1] === '$$' ? '$$' : '\\]';
      const first = line.trim().slice(2);
      const body: string[] = [];
      if (first.trimEnd().endsWith(close) && first.trim().length >= close.length) {
        body.push(first.trimEnd().slice(0, -close.length));
        i++;
      } else {
        if (first.trim()) body.push(first);
        i++;
        while (i < lines.length && !lines[i]!.trimEnd().endsWith(close)) body.push(lines[i++]!);
        if (i < lines.length) {
          const last = lines[i]!.trimEnd();
          body.push(last.slice(0, -close.length));
          i++;
        }
      }
      blocks.push({ kind: 'math', lines: [body.join('\n').trim()] });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'h', level: h[1]!.length, lines: [h[2]!] });
      i++;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ kind: 'hr', lines: [] });
      i++;
      continue;
    }
    // GitHub-style table: a row with pipes followed by a separator row
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
      const rows: string[][] = [];
      const raw = [line, lines[i + 1]!];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        raw.push(lines[i]!);
        const cells = splitRow(lines[i++]!);
        rows.push(head.map((_, ci) => cells[ci] ?? ''));
      }
      blocks.push({ kind: 'table', lines: raw, head, rows, align });
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (LIST.test(lines[i]!) || (/^\s{2,}\S/.test(lines[i]!) && items.length))) {
        if (LIST.test(lines[i]!)) items.push(lines[i]!.replace(LIST, ''));
        else items[items.length - 1] += ` ${lines[i]!.trim()}`;
        i++;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', lines: items });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) q.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', lines: q });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^\s*(```|#{1,6}\s|>|[-*•]\s|\d+[.)]\s|\$\$|\\\[)/.test(lines[i]!) &&
      !HR.test(lines[i]!) &&
      !(lines[i]!.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!))
    )
      para.push(lines[i++]!);
    if (!para.length) para.push(lines[i++]!);
    blocks.push({ kind: 'p', lines: para });
  }
  return blocks;
}

/** Plain text for a table, tab-separated so it pastes into spreadsheets as cells. */
export const tableToTsv = (head: string[], rows: string[][]) => [head, ...rows].map((r) => r.map((c) => c.replace(/\*\*|`/g, '').replace(/\t|\n/g, ' ')).join('\t')).join('\n');

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = parseBlocks(text);
  return (
    <div className={`md${streaming ? ' caret' : ''}`}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        switch (b.kind) {
          case 'h':
            return b.level! <= 2 ? <h3 key={key}>{inline(b.lines[0]!, key)}</h3> : <h4 key={key}>{inline(b.lines[0]!, key)}</h4>;
          case 'hr':
            return <hr key={key} />;
          case 'ul':
            return (
              <ul key={key}>
                {b.lines.map((l, li) => (
                  <li key={li}>{inline(l, `${key}-${li}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key}>
                {b.lines.map((l, li) => (
                  <li key={li}>{inline(l, `${key}-${li}`)}</li>
                ))}
              </ol>
            );
          case 'code': {
            const code = b.lines.join('\n');
            return (
              <div key={key} className="code-block">
                <div className="code-head">
                  <span>{b.lang || 'code'}</span>
                  <CopyMini text={code} label="Copy code" />
                </div>
                <pre>
                  <code>{code}</code>
                </pre>
              </div>
            );
          }
          case 'math':
            return (
              <div key={key} className="math-block">
                <MathView tex={b.lines[0]!} display />
                <CopyMini text={b.lines[0]!} label="Copy LaTeX" />
              </div>
            );
          case 'table':
            return (
              <div key={key} className="table-wrap">
                <div className="code-head">
                  <span>
                    table · {b.rows.length} {b.rows.length === 1 ? 'row' : 'rows'}
                  </span>
                  <CopyMini text={tableToTsv(b.head, b.rows)} label="Copy table" />
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {b.head.map((c, ci) => (
                          <th key={ci} style={b.align[ci] ? { textAlign: b.align[ci]! } : undefined}>
                            {inline(c, `${key}-h${ci}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r, ri) => (
                        <tr key={ri}>
                          {r.map((c, ci) => (
                            <td key={ci} style={b.align[ci] ? { textAlign: b.align[ci]! } : undefined}>
                              {inline(c, `${key}-${ri}-${ci}`)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          case 'quote':
            return <blockquote key={key}>{inline(b.lines.join(' '), key)}</blockquote>;
          default:
            return (
              <p key={key}>
                {b.lines.map((l, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {inline(l, `${key}-${li}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
