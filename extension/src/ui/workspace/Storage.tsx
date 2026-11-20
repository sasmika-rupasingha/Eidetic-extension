/** Settings › Storage: how much space the library uses, remove temporary captures now, export a backup of the text. */
import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, type Category } from '../../detect/classify';
import { deleteCaptures, expiredIds, listCaptures, usage, type Capture, type Usage } from '../../store/captures';
import { breakdown, type Breakdown } from '../../store/cleanup';
import { exportBackup, importBackup, parseBackup, reportLine } from '../../store/backup';
import type { Workspace } from '../../store/workspaces';
import type { Settings } from '../../store/settings';
import { Dialog } from '../shared/components';
import { download } from '../shared/useActions';

import { mb } from './CleanupPage';

function BreakdownTable({ title, rows, testid }: { title: string; rows: Breakdown[]; testid: string }) {
  const max = Math.max(1, ...rows.map((r) => r.bytes));
  return (
    <div className="table-scroll">
      <table className="data bars" data-testid={testid}>
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col">Captures</th>
            <th scope="col">Images</th>
            <th scope="col" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>{r.count}</td>
              <td>{mb(r.bytes)}</td>
              <td className="bar" aria-hidden="true">
                <div className="meter">
                  <span style={{ width: `${Math.max(2, (r.bytes / max) * 100)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Storage({ settings: s, toast, captures, workspaces }: { settings: Settings; toast: (m: string) => void; captures: Capture[] | null; workspaces: Workspace[] }) {
  const [u, setU] = useState<Usage | null>(null);
  const [pending, setPending] = useState<{ ids: string[]; label: string } | null>(null);
  const load = () => void usage().then(setU);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [imported, setImported] = useState<{ ok: boolean; text: string } | null>(null);

  const backup = async () => {
    setBusy('Preparing the backup…');
    try {
      const { blob, counts } = await exportBackup(chrome.runtime.getManifest().version);
      download(blob, `eidetic-backup-${new Date().toISOString().slice(0, 10)}.eidetic.json`);
      toast(`Backup saved: ${counts.captures} captures with images (no API keys)`);
    } catch (e) {
      toast((e as Error).message || 'Couldn’t make the backup');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: File) => {
    setBusy('Checking the backup…');
    setImported(null);
    try {
      const parsed = parseBackup(await file.text());
      setBusy(`Adding ${parsed.captures.length} captures…`);
      const r = await importBackup(parsed, { restoreSettings });
      setImported({ ok: true, text: reportLine(r) });
      load();
    } catch (e) {
      setImported({ ok: false, text: (e as Error).message || 'Couldn’t import this file.' });
    } finally {
      setBusy(null);
    }
  };
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
      {captures?.length ? (
        <section className="ws-section" aria-labelledby="dash-h">
          <h2 id="dash-h">What uses the space</h2>
          <BreakdownTable title="Kind" testid="by-kind" rows={breakdown(captures, 'kind', (k) => (k === 'video' ? 'Video' : k === 'other' ? 'Other' : (CATEGORY_LABEL[k as Category] ?? k)))} />
          {workspaces.length ? <BreakdownTable title="Workspace" testid="by-workspace" rows={breakdown(captures, 'workspace', (k) => workspaces.find((w) => w.id === k)?.name ?? 'No workspace')} /> : null}
          <BreakdownTable title="Month" testid="by-month" rows={breakdown(captures, 'month', (k) => new Date(`${k}-01T12:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' }))} />
        </section>
      ) : null}
      <section className="ws-section">
        <h2>Clean up</h2>
        <p className="small" style={{ margin: 0 }}>
          <a href="#/settings/cleanup">Find duplicates, look-alikes and the largest captures ›</a>
        </p>
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
        <h2>Backup and import</h2>
        <p className="small muted" style={{ margin: 0 }}>
          A full backup is one <code>.eidetic.json</code> file with every capture and its image, notes, saved answers and links, your workspaces, study notebooks, watched pages and settings. <strong>API keys are never included.</strong> Keep the file somewhere safe: it contains everything you captured.
        </p>
        <div className="row-gap wrap">
          <button type="button" className="btn small primary" data-testid="backup-export" disabled={Boolean(busy)} onClick={() => void backup()}>
            Back up everything
          </button>
          <button type="button" className="btn small" onClick={() => void exportText()}>
            Export library text only
          </button>
        </div>
        <div className="field">
          <label htmlFor="backup-file">Import a backup</label>
          <input id="backup-file" type="file" accept=".json,application/json" className="input" disabled={Boolean(busy)} onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = '';
          }} />
          <span className="help">Everything in the file is checked first. Captures already in your library are skipped; nothing is replaced.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={restoreSettings} onChange={(e) => setRestoreSettings(e.target.checked)} />
          <span>Also restore settings from the backup (your API keys stay as they are)</span>
        </label>
        {busy ? (
          <div className="row-gap small muted" role="status">
            <span className="spinner" /> {busy}
          </div>
        ) : null}
        {imported ? (
          <div className={`note ${imported.ok ? 'ok' : 'err'}`} role={imported.ok ? 'status' : 'alert'} data-testid="import-report">
            {imported.text}
          </div>
        ) : null}
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
