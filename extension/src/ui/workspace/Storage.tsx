/** Settings › Storage: how much space the library uses, remove temporary captures now, export a backup of the text. */
import { useEffect, useState } from 'react';
import { deleteCaptures, expiredIds, listCaptures, usage, type Usage } from '../../store/captures';
import type { Settings } from '../../store/settings';
import { Dialog } from '../shared/components';
import { download } from '../shared/useActions';

const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);

export function Storage({ settings: s, toast }: { settings: Settings; toast: (m: string) => void }) {
  const [u, setU] = useState<Usage | null>(null);
  const [pending, setPending] = useState<{ ids: string[]; label: string } | null>(null);
  const load = () => void usage().then(setU);
  useEffect(load, []);

  const prepare = async (kind: 'temporary' | 'expired') => {
    const caps = await listCaptures();
    const ids = kind === 'expired' ? expiredIds(caps, s.tempDays || 7) : caps.filter((c) => c.status === 'temporary' && !c.pinned && !c.notes.trim() && !c.answers.length).map((c) => c.id);
    if (!ids.length) return toast('Nothing to remove');
    setPending({ ids, label: kind === 'expired' ? `older than ${s.tempDays || 7} days` : 'that you didn’t keep' });
  };

  const exportText = async () => {
    const caps = await listCaptures();
    const data = caps.map((c) => ({ number: c.number, createdAt: new Date(c.createdAt).toISOString(), status: c.status, pinned: c.pinned, source: c.source, video: c.video, kind: c.detection?.label, description: c.ai.description ?? c.detection?.description, text: c.ocr?.text, notes: c.notes, answers: c.answers }));
    download(new Blob([JSON.stringify({ app: 'Eidetic', version: 1, exportedAt: new Date().toISOString(), captures: data }, null, 2)], { type: 'application/json' }), `eidetic-library-${new Date().toISOString().slice(0, 10)}.json`);
    toast('Library text exported (images are not included)');
  };

  return (
    <div className="ws-page narrow">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Storage</h1>
      </div>
      {u ? (
        <section className="ws-section">
          <dl className="kv">
            <dt>Captures</dt>
            <dd>
              {u.count} ({u.kept} kept, {u.temporary} temporary)
            </dd>
            <dt>Images</dt>
            <dd>{mb(u.imageBytes)}</dd>
            {u.quota ? (
              <>
                <dt>Browser storage used</dt>
                <dd>
                  {mb(u.used ?? 0)} of {mb(u.quota)} available
                </dd>
              </>
            ) : null}
          </dl>
          {u.quota ? (
            <div className="meter" role="img" aria-label={`${Math.round(((u.used ?? 0) / u.quota) * 100)}% of available storage used`}>
              <span style={{ width: `${Math.max(1, Math.min(100, ((u.used ?? 0) / u.quota) * 100))}%` }} />
            </div>
          ) : null}
        </section>
      ) : null}
      <section className="ws-section">
        <h2>Clean up</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Only temporary captures are offered: never kept, pinned, annotated or used with AI. You see the count before anything is removed.
        </p>
        <div className="row-gap wrap">
          <button type="button" className="btn small" onClick={() => void prepare('expired')}>
            Remove expired temporary captures
          </button>
          <button type="button" className="btn small" onClick={() => void prepare('temporary')}>
            Remove all temporary captures
          </button>
        </div>
      </section>
      <section className="ws-section">
        <h2>Backup</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Exports the text, notes, descriptions and saved answers of every capture as a JSON file. Images aren’t included in this version.
        </p>
        <div>
          <button type="button" className="btn small" onClick={() => void exportText()}>
            Export library text
          </button>
        </div>
      </section>
      {pending ? (
        <Dialog
          title={`Remove ${pending.ids.length} capture${pending.ids.length === 1 ? '' : 's'}?`}
          onClose={() => setPending(null)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void deleteCaptures(pending.ids).then(() => {
                    toast(`${pending.ids.length} removed`);
                    setPending(null);
                    load();
                  })
                }
              >
                Remove
              </button>
            </>
          }
        >
          <p className="small">
            These are temporary captures {pending.label}. Kept, pinned and annotated captures are not affected.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
