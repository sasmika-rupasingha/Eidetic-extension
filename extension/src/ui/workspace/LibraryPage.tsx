/** The library at full width: search, filters, select several, and delete with a preview. */
import { useDeferredValue, useMemo, useState } from 'react';
import { search, type Filter } from '../../search/search';
import { deleteCaptures, updateCapture, type Capture } from '../../store/captures';
import { CaptureRow, Dialog, Empty, titleOf } from '../shared/components';
import { FILTERS, MatchReason } from '../panel/LibraryView';

export function LibraryPage({ captures, query, toast }: { captures: Capture[] | null; query: string; toast: (m: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const dq = useDeferredValue(query);
  const results = useMemo(() => (captures ? search(captures, dq, filter) : []), [captures, dq, filter]);
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
      {chosen.length ? (
        <div className="bulk" role="region" aria-label="Selected captures">
          <span>
            {chosen.length} selected
          </span>
          <span className="row-gap">
            <button type="button" className="btn small" onClick={() => void Promise.all(chosen.map((c) => updateCapture(c.id, (x) => void (x.status = 'kept')))).then(() => toast(`${chosen.length} kept`))}>
              Keep
            </button>
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
          <Empty title="No matches">Try fewer words, or a word you remember from the capture or your note.</Empty>
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
