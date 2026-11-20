/** Visual Memory in the result view: up to 5 related captures with the reason, open on click, remove a link. */
import { useEffect, useState } from 'react';
import { removeRelation } from '../../memory/link';
import { visibleRelations } from '../../memory/related';
import { getCapture, onCapturesChanged, type Capture } from '../../store/captures';
import { IconClose } from '../design/icons';
import { Thumb, titleOf } from './components';

export function Related({ capture, onOpen }: { capture: Capture; onOpen: (id: string) => void }) {
  const [others, setOthers] = useState<Map<string, Capture>>(new Map());
  const ids = capture.relations.filter((r) => !r.removed).map((r) => r.id);
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    const load = () =>
      void Promise.all(ids.map((id) => getCapture(id))).then((list) => {
        if (live) setOthers(new Map(list.filter((c): c is Capture => Boolean(c)).map((c) => [c.id, c])));
      });
    load();
    const off = onCapturesChanged((changed) => {
      if (!changed || ids.includes(changed)) load();
    });
    return () => {
      live = false;
      off();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = visibleRelations(capture, (id) => others.has(id)).slice(0, 5);
  if (!shown.length) return null;
  return (
    <section className="related" aria-label="Related captures" data-testid="related">
      <h2 className="h-section">Related</h2>
      <ul className="plain related-list">
        {shown.map((r) => {
          const o = others.get(r.id)!;
          return (
            <li key={r.id} className="related-item">
              <Thumb capture={o} size={48} />
              <div className="grow min0">
                <button type="button" className="linkish related-title" onClick={() => onOpen(o.id)}>
                  {titleOf(o)}
                </button>
                <div className="small muted">{r.reason || 'Linked'}</div>
              </div>
              <button type="button" className="btn ghost icon small" aria-label={`Not related: ${titleOf(o)}`} title="Not related (won’t be suggested again)" onClick={() => void removeRelation(capture.id, o.id)}>
                <IconClose size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="small muted">Found on this computer from the page, the time, shared topics and the text.</p>
    </section>
  );
}
