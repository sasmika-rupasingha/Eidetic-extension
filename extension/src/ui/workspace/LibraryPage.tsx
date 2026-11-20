/** The library at full width: search, filters, select several, and delete with a preview. */
import { useDeferredValue, useMemo, useState } from 'react';
import { hasTopic, topicCounts } from '../../memory/related';
import { search, type Filter } from '../../search/search';
import { deleteCaptures, updateCapture, type Capture } from '../../store/captures';
import type { Statuses } from '../../ai/run';
import type { Settings } from '../../store/settings';
import { CaptureRow, Dialog, Empty, titleOf } from '../shared/components';
import { MeaningResults } from '../shared/MeaningResults';
import { moveTo } from '../shared/WorkspaceTag';
import type { Workspace } from '../../store/workspaces';
import { FILTERS, MatchReason } from '../panel/LibraryView';

export function LibraryPage({ captures, query, toast, settings, statuses, workspaces }: { workspaces: Workspace[]; captures: Capture[] | null; query: string; toast: (m: string) => void; settings: Settings; statuses: Statuses }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [topic, setTopic] = useState('');
  const [wsFilter, setWsFilter] = useState('');
  const topics = useMemo(() => (captures ? topicCounts(captures) : []), [captures]);
  const dq = useDeferredValue(query);
  const results = useMemo(() => (captures ? search(captures, dq, filter).filter((m) => (!topic || hasTopic(m.capture, topic)) && (!wsFilter || (wsFilter === 'none' ? !m.capture.workspaceId : m.capture.workspaceId === wsFilter))) : []), [captures, dq, filter, topic, wsFilter]);
  const chosen = results.filter((m) => selected.has(m.capture.id)).map((m) => m.capture);

  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="ws-page">
      <div className="page-head">
        <div className="eyebrow">Visual memory</div>
        <h1 className="page-title">Library</h1>
        <p className="page-intro">Everything you capture, searchable by its text, your notes, the page it came from and what Eidetic recognised. Search runs on this computer.</p>
      </div>
      <div className="chips" role="group" aria-label="Filter by kind">
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      <div className="lib-filters">
      {workspaces.length ? (
        <div className="field ws-select">
          <label htmlFor="lib-ws">Workspace</label>
          <select id="lib-ws" className="input" value={wsFilter} onChange={(e) => setWsFilter(e.target.value)}>
            <option value="">All workspaces</option>
            <option value="none">No workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {topics.length ? (
        <div className="field topic-filter">
          <label htmlFor="lib-topic" className="help">
            Topic
          </label>
          <select id="lib-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">All topics</option>
            {topics.map(([t, n]) => (
              <option key={t} value={t}>
                {t} ({n})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      </div>
      {chosen.length ? (
        <div className="bulk" role="region" aria-label="Selected captures">
          <span>
            {chosen.length} selected
          </span>
          <span className="row-gap">
            <button type="button" className="btn small" onClick={() => void Promise.all(chosen.map((c) => updateCapture(c.id, (x) => void (x.status = 'kept')))).then(() => toast(`${chosen.length} kept`))}>
              Keep
            </button>
            {workspaces.length ? (
              <select
                className="input small-select"
                aria-label="Move the selected captures to a workspace"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  void moveTo(chosen.map((c) => c.id), v === 'none' ? '' : v).then(() => toast(v === 'none' ? `${chosen.length} removed from their workspace` : `${chosen.length} moved to ${workspaces.find((w) => w.id === v)?.name ?? 'workspace'}`));
                }}
              >
                <option value="">Move to workspace…</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
                <option value="none">No workspace</option>
              </select>
            ) : null}
            {chosen.length >= 2 ? (
              <button type="button" className="btn small" disabled={chosen.length > 8} title={chosen.length > 8 ? 'Choose up to 8 captures to compare' : undefined} onClick={() => (location.hash = `/compare/${chosen.map((c) => c.id).join(',')}`)}>
                Compare{chosen.length > 8 ? ' (up to 8)' : ''}
              </button>
            ) : null}
            <button type="button" className="btn small danger" onClick={() => setConfirm(true)}>
              Delete…
            </button>
            <button type="button" className="btn small ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </span>
        </div>
      ) : null}
      <div className="lib-grid">
        <div className="meta lib-count">
          <span>{captures ? `${results.length} capture${results.length === 1 ? '' : 's'}` : 'Loading…'}</span>
          {results.length ? (
            <button type="button" className="linkish small" onClick={() => setSelected(new Set(results.map((m) => m.capture.id)))}>
              Select all shown
            </button>
          ) : null}
        </div>
        {captures && !captures.length ? (
          <Empty title="Your library is empty">Capture something with Alt+Shift+E on any page, or from the Eidetic side panel.</Empty>
        ) : captures && !results.length ? (
          <Empty title="No word matches">Try fewer words, or a word you remember from the capture or your note.</Empty>
        ) : (
          results.map((m) => (
            <CaptureRow
              key={m.capture.id}
              capture={m.capture}
              onOpen={() => (location.hash = `/capture/${m.capture.id}`)}
              selected={selected.has(m.capture.id)}
              onSelect={(on) => toggle(m.capture.id, on)}
              extra={dq ? <MatchReason m={m} /> : null}
            />
          ))
        )}
        {dq ? <MeaningResults captures={captures} query={dq} settings={settings} statuses={statuses} exclude={results.map((m) => m.capture.id)} onOpen={(id) => (location.hash = `/capture/${id}`)} /> : null}
      </div>
      {confirm ? (
        <Dialog
          title={`Delete ${chosen.length} capture${chosen.length === 1 ? '' : 's'}?`}
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void deleteCaptures(chosen.map((c) => c.id)).then(() => {
                    toast(`${chosen.length} deleted`);
                    setSelected(new Set());
                    setConfirm(false);
                  })
                }
              >
                Delete
              </button>
            </>
          }
        >
          <ul className="plain small" style={{ maxHeight: 200, overflow: 'auto' }}>
            {chosen.slice(0, 50).map((c) => (
              <li key={c.id}>{titleOf(c)}</li>
            ))}
            {chosen.length > 50 ? <li>…and {chosen.length - 50} more</li> : null}
          </ul>
          <p className="small muted">Images, text, notes and saved answers are removed from this computer. This can’t be undone.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
