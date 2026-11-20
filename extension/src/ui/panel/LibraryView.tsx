/** Library in the panel: search everything you captured, filter by kind, see why each result matched. */
import { useDeferredValue, useMemo, useState } from 'react';
import { FIELD_LABEL, search, type Filter } from '../../search/search';
import type { Capture } from '../../store/captures';
import { IconClose, IconSearch } from '../design/icons';
import { CaptureRow, Empty } from '../shared/components';

export const FILTERS: Array<[Filter, string]> = [
  ['all', 'All'],
  ['slide', 'Slides'],
  ['video', 'Video'],
  ['error', 'Errors'],
  ['code', 'Code'],
  ['table', 'Tables'],
  ['question', 'Questions'],
  ['event', 'Events'],
  ['kept', 'Kept'],
];

export function MatchReason({ m }: { m: ReturnType<typeof search>[number] }) {
  if (!m.snippet && m.score === 0) return null;
  return (
    <div className="small muted reason">
      {FIELD_LABEL[m.field]}
      {m.snippet ? (
        <>
          : “{m.snippet.before}
          <mark>{m.snippet.hit}</mark>
          {m.snippet.after}”
        </>
      ) : null}
    </div>
  );
}

export function LibraryView({ captures, onOpen, onWorkspace }: { captures: Capture[] | null; onOpen: (id: string) => void; onWorkspace: () => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const dq = useDeferredValue(q);
  const results = useMemo(() => (captures ? search(captures, dq, filter) : []), [captures, dq, filter]);

  return (
    <div className="library">
      <div className="lib-tools">
        <div className="input-group">
          <IconSearch size={17} style={{ color: 'var(--muted)' }} />
          <label className="sr-only" htmlFor="lib-q">
            Search your captures
          </label>
          <input id="lib-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything you captured" autoComplete="off" />
          {q ? (
            <button type="button" className="btn ghost icon small" aria-label="Clear search" onClick={() => setQ('')}>
              <IconClose size={15} />
            </button>
          ) : null}
        </div>
        <div className="chips" role="group" aria-label="Filter by kind">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="meta lib-count">
        <span>
          {captures ? `${results.length} capture${results.length === 1 ? '' : 's'}` : 'Loading…'}
        </span>
        <span>{q ? 'Searched on this computer' : ''}</span>
      </div>
      {captures && !captures.length ? (
        <Empty title="Your library is empty">Everything you capture is saved here, searchable by its text, your notes and where it came from.</Empty>
      ) : captures && !results.length ? (
        <Empty title="No matches">Try fewer words, or a word you remember from the capture or your note.</Empty>
      ) : (
        results.slice(0, 200).map((m) => <CaptureRow key={m.capture.id} capture={m.capture} onOpen={() => onOpen(m.capture.id)} extra={q ? <MatchReason m={m} /> : null} />)
      )}
      {captures && captures.length > 6 ? (
        <button type="button" className="btn ghost small" onClick={onWorkspace}>
          Open the library in a full tab
        </button>
      ) : null}
    </div>
  );
}
