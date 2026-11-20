/**
 * Compare 2–8 captures side by side: images and text, a local text diff, their tables merged into one comparison
 * table, and AI actions that see every capture (each in its own <content index="n"> block).
 */
import { useMemo, useRef, useState } from 'react';
import { diffText, mergeTables, sameness } from '../../compare/diff';
import type { AiTaskId } from '../../ai/prompts';
import { AI_TASKS } from '../../ai/prompts';
import { describeError, readyMap, runAi, type Statuses } from '../../ai/run';
import type { Route } from '../../ai/router';
import { CATEGORY_LABEL } from '../../detect/classify';
import { toCSV, toMarkdown } from '../../detect/table';
import { formatNumber, type Capture } from '../../store/captures';
import type { Settings } from '../../store/settings';
import { IconAlert, IconExternal } from '../design/icons';
import { CropMarks, titleOf } from '../shared/components';
import { useImageUrl } from '../shared/hooks';
import { Markdown } from '../shared/markdown';
import { download, previewRoute, routeLine } from '../shared/useActions';
import { StudyMaker } from '../shared/StudyMaker';

export const MAX_COMPARE = 8;

function Column({ c }: { c: Capture }) {
  const url = useImageUrl(c.image.blobId, c.image.bytes);
  return (
    <article className="cmp-col" data-testid="compare-col">
      <CropMarks className="result-image">{url ? <img src={url} alt={`Capture: ${titleOf(c)}`} /> : <div className="img-placeholder" />}</CropMarks>
      <div className="meta">
        {formatNumber(c.number)} · {c.source.site || 'Image'}
      </div>
      <h2 className="serif cmp-title">
        <a href={`#/capture/${c.id}`}>{titleOf(c)}</a>
      </h2>
      <pre className="ocr-text cmp-text">{c.ocr?.text || '(No text recognised)'}</pre>
    </article>
  );
}

/** Runs one AI task over several captures and streams the answer. */
export function useMultiAi(caps: Capture[], settings: Settings, statuses: Statuses) {
  const [state, setState] = useState<{ task: AiTaskId; text: string; route: Route | null; streaming: boolean; error?: { message: string; hint: string } } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const run = async (task: AiTaskId, extraItems?: Array<{ text: string; category: string; description: string; source?: string }>) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setState({ task, text: '', route: null, streaming: true });
    const items = extraItems ?? caps.map((c) => ({ text: c.ocr?.text ?? '', category: c.detection ? CATEGORY_LABEL[c.detection.category] : 'Capture', description: c.ai.description ?? c.detection?.description ?? '', source: c.source.site }));
    try {
      const r = await runAi(task, { text: '', category: 'Several captures', description: '', items }, settings, statuses, {
        signal: ac.signal,
        onRoute: (route) => setState((s) => (s ? { ...s, route } : s)),
        onText: (text) => setState((s) => (s ? { ...s, text } : s)),
      });
      setState((s) => (s ? { ...s, text: r.text, route: r.route, streaming: false } : s));
      return r.text;
    } catch (e) {
      setState((s) => (s ? { ...s, streaming: false, error: describeError(e) } : s));
      return null;
    }
  };
  const stop = () => abort.current?.abort();
  return { state, run, stop };
}

export function AiAnswer({ state, stop }: { state: ReturnType<typeof useMultiAi>['state']; stop: () => void }) {
  if (!state) return null;
  return (
    <section className="answer" aria-label="Answer" aria-busy={state.streaming} data-testid="multi-answer">
      <div className="answer-head">
        <h2 className="h-section">{AI_TASKS[state.task].label}</h2>
        {state.route ? (
          <span className="meta" title={state.route.reason}>
            {state.route.model} · {state.route.local ? 'local' : 'cloud'}
          </span>
        ) : null}
      </div>
      {state.route && !state.route.local && state.streaming ? (
        <div className="small muted row-gap">
          <IconExternal size={13} /> {routeLine(state.route)}
        </div>
      ) : null}
      {state.streaming && !state.text ? (
        <div className="row-gap small muted" role="status">
          <span className="spinner" /> {state.route ? `Asking ${state.route.model}…` : 'Choosing a model…'}
        </div>
      ) : null}
      {state.text ? <Markdown text={state.text} streaming={state.streaming} /> : null}
      {state.error ? (
        <div className="note err" role="alert">
          <IconAlert size={16} />
          <div>
            <div>{state.error.message}</div>
            {state.error.hint ? <div className="hint">{state.error.hint}</div> : null}
          </div>
        </div>
      ) : null}
      {state.streaming ? (
        <button type="button" className="btn small" onClick={stop}>
          Stop
        </button>
      ) : null}
    </section>
  );
}

export function ComparePage({ ids, captures, settings, statuses, toast }: { ids: string[]; captures: Capture[] | null; settings: Settings; statuses: Statuses; toast: (m: string) => void }) {
  const caps = useMemo(() => ids.map((id) => captures?.find((c) => c.id === id)).filter((c): c is Capture => Boolean(c)).slice(0, MAX_COMPARE), [ids, captures]);
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const { state, run, stop } = useMultiAi(caps, settings, statuses);
  const ops = useMemo(() => (caps[a] && caps[b] ? diffText(caps[a].ocr?.text ?? '', caps[b].ocr?.text ?? '') : []), [caps, a, b]);
  const merged = useMemo(() => mergeTables(caps.filter((c) => c.detection?.table?.length).map((c) => ({ label: formatNumber(c.number), rows: c.detection!.table! }))), [caps]);
  const aiReady = Object.keys(readyMap(statuses)).length > 0;
  const r = previewRoute('combine', settings, statuses, false);
  if (!captures) return null;
  if (caps.length < 2)
    return (
      <div className="ws-page">
        <p>Choose 2 to {MAX_COMPARE} captures in the library to compare them.</p>
        <a href="#/library">‹ Library</a>
      </div>
    );
  const pick = (id: string, value: number, set: (n: number) => void) => (
    <select id={id} className="input small-select" value={value} onChange={(e) => set(Number(e.target.value))}>
      {caps.map((c, i) => (
        <option key={c.id} value={i}>
          {formatNumber(c.number)} · {titleOf(c).slice(0, 50)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="ws-page wide">
      <a href="#/library" className="small">
        ‹ Library
      </a>
      <div className="page-head">
        <div className="eyebrow">Compare and combine</div>
        <h1 className="page-title">{caps.length} captures side by side</h1>
      </div>
      <div className="cmp-grid" style={{ gridTemplateColumns: `repeat(${Math.min(caps.length, 4)}, minmax(0, 1fr))` }}>
        {caps.map((c) => (
          <Column key={c.id} c={c} />
        ))}
      </div>

      <section className="ws-section" aria-labelledby="diff-h">
        <h2 id="diff-h">Text differences</h2>
        <div className="row-gap wrap">
          <label htmlFor="diff-a" className="small">
            Compare
          </label>
          {pick('diff-a', a, setA)}
          <label htmlFor="diff-b" className="small">
            with
          </label>
          {pick('diff-b', b, setB)}
        </div>
        <div className="small muted" data-testid="diff-summary">
          {a === b ? 'Choose two different captures.' : `${Math.round(sameness(ops) * 100)}% of the text is the same. Removed text is struck through, added text is underlined.`}
        </div>
        {a !== b ? (
          <pre className="ocr-text diff" data-testid="diff">
            {ops.map((o, i) => (o.type === 'same' ? <span key={i}>{o.text}</span> : o.type === 'add' ? <ins key={i}>{o.text}</ins> : <del key={i}>{o.text}</del>))}
          </pre>
        ) : null}
      </section>

      {merged.length > 1 ? (
        <section className="ws-section" aria-labelledby="merge-h">
          <h2 id="merge-h">Tables merged</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Columns are matched by their headings; each row says which capture it comes from.
          </p>
          <div className="table-scroll">
            <table className="data" data-testid="merged-table">
              <thead>
                <tr>
                  {merged[0]!.map((h, i) => (
                    <th key={i} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {merged.slice(1).map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-gap wrap">
            <button type="button" className="btn small" onClick={() => void navigator.clipboard.writeText(toMarkdown(merged)).then(() => toast('Markdown table copied'), () => toast('Couldn’t copy'))}>
              Copy Markdown
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                download(new Blob([`﻿${toCSV(merged)}`], { type: 'text/csv' }), 'eidetic-comparison.csv');
                toast('CSV downloaded');
              }}
            >
              Download CSV
            </button>
          </div>
        </section>
      ) : null}

      <section className="ws-section" aria-labelledby="cmp-ai-h">
        <h2 id="cmp-ai-h">With AI</h2>
        <div className="row-gap wrap">
          {(['combine', 'contradictions', 'compare-table'] as const).map((t) => (
            <button key={t} type="button" className="btn" disabled={!aiReady || Boolean(state?.streaming)} onClick={() => void run(t)}>
              {AI_TASKS[t].label}
            </button>
          ))}
        </div>
        <div className="small muted" data-testid="cmp-route">
          {!aiReady ? 'Connect a model in Settings › AI models to combine captures.' : r ? routeLine(r).replace('the text', `the text of ${caps.length} captures`) : 'No model is ready for this.'}
        </div>
        <AiAnswer state={state} stop={stop} />
      </section>

      <section className="ws-section" aria-labelledby="cmp-study-h">
        <h2 id="cmp-study-h">Study</h2>
        <StudyMaker captures={caps} settings={settings} statuses={statuses} toast={toast} />
      </section>
    </div>
  );
}
