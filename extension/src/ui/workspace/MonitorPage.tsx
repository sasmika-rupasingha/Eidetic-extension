/** Monitor: watched parts of pages, their latest text, what changed and when, and how often they are checked. */
import { useEffect, useState } from 'react';
import { deleteMonitor, editMonitor, INTERVALS, originOf, type Monitor } from '../../monitor/monitor';
import { BROWSER_NAME } from '../../shared/browser';
import { ChangeList } from '../shared/ChangesView';
import { Dialog, Empty } from '../shared/components';
import { timeAgo } from '../shared/hooks';

const send = (msg: { type: string; id?: string }) => chrome.runtime.sendMessage(msg) as Promise<{ ok: boolean; status?: string; error?: string } | undefined>;

const STATUS: Record<Monitor['status'], string> = {
  ok: 'Checked',
  new: 'Not checked yet',
  'not-found': 'The watched part wasn’t in the page',
  error: 'Couldn’t check',
  'needs-permission': 'Needs your permission',
};

function MonitorCard({ m, toast }: { m: Monitor; toast: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (type: 'monitor-check' | 'monitor-open-check') => {
    setBusy(true);
    try {
      const r = await send({ type, id: m.id });
      if (r && !r.ok) toast(r.error ?? 'Couldn’t check');
    } finally {
      setBusy(false);
    }
  };
  const allow = async () => {
    const o = originOf(m.url);
    if (o && (await chrome.permissions.request({ origins: [o] }).catch(() => false))) await run('monitor-check');
    else toast('Not allowed');
  };
  const last = m.changes[m.changes.length - 1];
  return (
    <article className="monitor" data-testid="monitor">
      <div className="section-head">
        <div className="min0">
          <h2 className="serif monitor-title">{m.title || m.site}</h2>
          <a className="small ellipsis" href={m.url} target="_blank" rel="noreferrer">
            {m.url}
          </a>
        </div>
        {m.unread ? <span className="tag">{m.unread} new</span> : null}
      </div>
      <div className="small" data-testid="monitor-status">
        <span className={`dot ${m.status === 'ok' ? 'ok' : m.status === 'new' ? 'off' : 'warn'}`} /> {STATUS[m.status]}
        {m.lastCheckedAt ? ` · ${timeAgo(m.lastCheckedAt)}` : ''}
        {m.lastChangedAt ? ` · last change ${timeAgo(m.lastChangedAt)}` : ' · no change yet'}
        {m.error ? <div className="muted">{m.error}</div> : null}
      </div>
      {m.status === 'not-found' ? (
        <div className="note warn small">
          <span>
            This page probably builds its content with scripts, so the part you chose isn’t in the page Eidetic downloads.{' '}
            <button type="button" className="linkish" disabled={busy} onClick={() => void run('monitor-open-check')}>
              Check by opening the page
            </button>{' '}
            (opens it in a background tab for a moment).
          </span>
        </div>
      ) : null}
      {m.status === 'needs-permission' ? (
        <div className="note warn small">
          <span>
            To check this page on a schedule, Eidetic needs access to {m.site} (only that site).{' '}
            <button type="button" className="btn small" onClick={() => void allow()}>
              Allow checking {m.site}
            </button>
          </span>
        </div>
      ) : null}
      <details>
        <summary className="small">Watched text</summary>
        <pre className="ocr-text" data-testid="monitor-text">
          {m.text}
        </pre>
      </details>
      {last ? (
        <div className="stack tight">
          <div className="small" data-testid="monitor-change-line">
            <strong>Latest change</strong> ({timeAgo(last.at)}): {last.line}
          </div>
          <ChangeList s={last.summary} />
          {m.changes.length > 1 ? (
            <details>
              <summary className="small">Earlier changes ({m.changes.length - 1})</summary>
              <ul className="plain small">
                {m.changes
                  .slice(0, -1)
                  .reverse()
                  .map((c) => (
                    <li key={c.at}>
                      {timeAgo(c.at)}: {c.line}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="row-gap wrap">
        <button type="button" className="btn small" disabled={busy} onClick={() => void run('monitor-check')}>
          {busy ? 'Checking…' : 'Check now'}
        </button>
        <label className="sr-only" htmlFor={`iv-${m.id}`}>
          How often to check
        </label>
        <select id={`iv-${m.id}`} className="input small-select" value={m.intervalMin} onChange={(e) => void editMonitor(m.id, (x) => void (x.intervalMin = Number(e.target.value)))}>
          {INTERVALS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="btn small ghost danger" onClick={() => setConfirm(true)}>
          Stop watching…
        </button>
      </div>
      {confirm ? (
        <Dialog
          title="Stop watching this page?"
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
                  void deleteMonitor(m.id).then(() => {
                    void send({ type: 'monitor-badge' });
                    toast('Stopped watching');
                  })
                }
              >
                Stop watching
              </button>
            </>
          }
        >
          <p className="small">Its history of changes is removed too.</p>
        </Dialog>
      ) : null}
    </article>
  );
}

export function MonitorPage({ monitors, toast }: { monitors: Monitor[] | null; toast: (m: string) => void }) {
  const [notify, setNotify] = useState(false);
  useEffect(() => {
    void chrome.storage.local.get('notifyMonitors').then((g) => setNotify(Boolean(g.notifyMonitors)));
  }, []);
  // Seeing the page counts as seeing the changes: clear the badge.
  const unread = monitors?.filter((m) => m.unread).map((m) => m.id).join(',') ?? '';
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => {
      void Promise.all(unread.split(',').map((id) => editMonitor(id, (m) => void (m.unread = 0)))).then(() => send({ type: 'monitor-badge' }));
    }, 4000);
    return () => clearTimeout(t);
  }, [unread]);
  const toggleNotify = async (on: boolean) => {
    if (on && !(await chrome.permissions.request({ permissions: ['notifications'] }).catch(() => false))) return toast('Notifications weren’t allowed');
    await chrome.storage.local.set({ notifyMonitors: on });
    setNotify(on);
  };
  return (
    <div className="ws-page narrow">
      <div className="page-head">
        <div className="eyebrow">Watch</div>
        <h1 className="page-title">Monitor</h1>
        <p className="page-intro">
          Parts of web pages you watch for changes. Eidetic downloads the page on a schedule (without your cookies), reads the part you chose and lists what changed. Nothing runs from the page and nothing is sent anywhere. To watch something, open the page and choose “Watch part of this page” in the Eidetic panel or the right-click menu.
        </p>
      </div>
      <label className="check">
        <input type="checkbox" checked={notify} onChange={(e) => void toggleNotify(e.target.checked)} />
        <span>Also show a {BROWSER_NAME} notification when something changes</span>
      </label>
      {monitors?.length ? monitors.map((m) => <MonitorCard key={m.id} m={m} toast={toast} />) : monitors ? <Empty title="Nothing watched yet">Open a page, then choose “Watch part of this page” in the Eidetic panel and click the part to watch.</Empty> : null}
      <p className="small muted">
        Limits: pages behind a login or a CAPTCHA can’t be checked, and pages that build their content with scripts may not contain the text when downloaded: use “Check by opening the page” for those. Checks run while {BROWSER_NAME} is open.
      </p>
    </div>
  );
}
