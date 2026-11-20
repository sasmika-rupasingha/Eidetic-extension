/** Settings › Clean up: duplicates, look-alikes, near-identical text, old temporary and largest captures, reviewed before deleting. */
import { useEffect, useMemo, useState } from 'react';
import { deleteCaptures, formatNumber, type Capture } from '../../store/captures';
import { findCleanup, suggestedDeletes, type CleanupReport, type Group } from '../../store/cleanup';
import { backfillHashes, exactKeys } from '../../store/hashes';
import type { Settings } from '../../store/settings';
import { Dialog, Empty, Thumb, titleOf } from '../shared/components';
import { timeAgo } from '../shared/hooks';

export const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e5 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function Item({ c, keep, checked, onCheck }: { c: Capture; keep?: boolean; checked: boolean; onCheck: (on: boolean) => void }) {
  return (
    <li className="clean-item">
      <label className="entry-check">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        <span className="sr-only">Delete {titleOf(c)}</span>
      </label>
      <Thumb capture={c} size={56} />
      <div className="grow min0">
        <a href={`#/capture/${c.id}`} className="clean-title">
          {titleOf(c)}
        </a>
        <div className="meta">
          {formatNumber(c.number)} · {timeAgo(c.createdAt)} · {mb(c.image.bytes)}
          {c.pinned ? ' · Pinned' : c.status === 'kept' ? ' · Kept' : ''}
        </div>
      </div>
      {keep ? <span className="badge-tag">Suggested to keep</span> : null}
    </li>
  );
}

export function CleanupPage({ captures, settings, toast }: { captures: Capture[] | null; settings: Settings; toast: (m: string) => void }) {
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const byId = useMemo(() => new Map((captures ?? []).map((c) => [c.id, c])), [captures]);
  const sig = captures?.map((c) => `${c.id}${c.hash ?? ''}`).join('|') ?? '';

  useEffect(() => {
    if (!captures) return;
    let live = true;
    void (async () => {
      if (captures.some((c) => !c.hash && !c.needsCrop)) await backfillHashes(); // updates captures → this runs again
      const keys = await exactKeys(captures);
      if (!live) return;
      const r = findCleanup(captures, (c) => keys.get(c.id), settings.tempDays);
      setReport(r);
      const pre = new Set([...suggestedDeletes([...r.exact, ...r.similar, ...r.sameText], byId), ...r.oldTemporary]);
      setSelected(pre);
    })();
    return () => {
      live = false;
    };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const groups = (title: string, testid: string, list: Group[], help: string) => (
    <section className="ws-section" data-testid={testid} aria-label={title}>
      <h2>
        {title} ({list.length})
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        {help}
      </p>
      {list.length ? (
        list.map((g, i) => (
          <ul key={i} className="plain clean-group">
            {g.ids.map((id, j) => (byId.get(id) ? <Item key={id} c={byId.get(id)!} keep={j === 0} checked={selected.has(id)} onCheck={(on) => toggle(id, on)} /> : null))}
          </ul>
        ))
      ) : (
        <p className="small">None found.</p>
      )}
    </section>
  );
  const flat = (title: string, testid: string, ids: string[], help: string) => (
    <section className="ws-section" data-testid={testid} aria-label={title}>
      <h2>
        {title} ({ids.length})
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        {help}
      </p>
      {ids.length ? (
        <ul className="plain clean-group">{ids.map((id) => (byId.get(id) ? <Item key={id} c={byId.get(id)!} checked={selected.has(id)} onCheck={(on) => toggle(id, on)} /> : null))}</ul>
      ) : (
        <p className="small">None found.</p>
      )}
    </section>
  );

  const chosen = [...selected].filter((id) => byId.has(id));
  const freed = chosen.reduce((s, id) => s + (byId.get(id)?.image.bytes ?? 0), 0);
  return (
    <div className="ws-page narrow">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Clean up</h1>
        <p className="page-intro">Eidetic suggests what to remove and keeps the pinned, kept or annotated capture of each group (otherwise the newest). Nothing is deleted until you confirm.</p>
      </div>
      {!captures || !report ? (
        <div className="row-gap small muted" role="status">
          <span className="spinner" /> Looking for duplicates on this computer…
        </div>
      ) : !captures.length ? (
        <Empty title="Your library is empty" />
      ) : (
        <>
          <div className="bulk" role="region" aria-label="Selected for deletion">
            <span data-testid="cleanup-selected">
              {chosen.length} selected · {mb(freed)}
            </span>
            <span className="row-gap">
              <button type="button" className="btn small ghost" onClick={() => setSelected(new Set())} disabled={!chosen.length}>
                Clear selection
              </button>
              <button type="button" className="btn small danger" onClick={() => setConfirm(true)} disabled={!chosen.length}>
                Delete selected…
              </button>
            </span>
          </div>
          {groups('Exact duplicates', 'cleanup-exact', report.exact, 'The very same image saved more than once.')}
          {groups('Similar images', 'cleanup-similar', report.similar, 'Images that look alike (perceptual hash), for example the same slide captured twice.')}
          {groups('Near-identical text', 'cleanup-text', report.sameText, 'Different images with almost the same text.')}
          {flat('Old temporary captures', 'cleanup-old', report.oldTemporary, `Temporary captures older than ${settings.tempDays || 7} days that you never kept, pinned, annotated or used with AI.`)}
          {flat('Largest captures', 'cleanup-largest', report.largest, 'The ten captures using the most space. None is selected for you.')}
        </>
      )}
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
                  void deleteCaptures(chosen).then(() => {
                    toast(`${chosen.length} deleted · ${mb(freed)} freed`);
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
            {chosen.slice(0, 50).map((id) => (
              <li key={id}>{titleOf(byId.get(id)!)}</li>
            ))}
            {chosen.length > 50 ? <li>…and {chosen.length - 50} more</li> : null}
          </ul>
          <p className="small muted">Images, text, notes and saved answers of these captures are removed from this computer. This can’t be undone.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
