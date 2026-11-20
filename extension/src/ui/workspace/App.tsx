/** The workspace tab: the library at full width, capture details, and settings. Routes live in the URL hash. */
import { useEffect, useState } from 'react';
import { IconLibrary, Logo } from '../design/icons';
import { Toast } from '../shared/components';
import { useCapture, useCaptures, useSettings, useStatuses, useMonitors, useNotebooks, useToast, useWorkspaces } from '../shared/hooks';
import { WorkspaceDetail, WorkspacesPage } from './WorkspacesPage';
import { ComparePage } from './ComparePage';
import { StudyDetail, StudyList } from './StudyPage';
import { MonitorPage } from './MonitorPage';
import { CleanupPage } from './CleanupPage';
import { ResultView } from '../shared/ResultView';
import { useEmbeddingBackfill } from '../shared/useMeaning';
import { AiModels } from './AiModels';
import { CaptureSettings } from './CaptureSettings';
import { LibraryPage } from './LibraryPage';
import { Appearance, Privacy } from './OtherSettings';
import { Storage } from './Storage';

const SECTIONS: Array<[string, string]> = [
  ['/settings/ai', 'AI models'],
  ['/settings/privacy', 'Privacy'],
  ['/settings/appearance', 'Appearance'],
  ['/settings/capture', 'Capture and languages'],
  ['/settings/storage', 'Storage'],
  ['/settings/cleanup', 'Clean up'],
];

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/library');
  useEffect(() => {
    const fn = () => setHash(location.hash.slice(1) || '/library');
    addEventListener('hashchange', fn);
    return () => removeEventListener('hashchange', fn);
  }, []);
  return hash;
}

export function App() {
  const settings = useSettings();
  const status = useStatuses(settings);
  const { captures } = useCaptures();
  const { toast, show } = useToast();
  const hash = useHash();
  const [query, setQuery] = useState('');
  const capId = hash.startsWith('/capture/') ? hash.slice('/capture/'.length) : null;
  const cap = useCapture(capId);
  const workspaces = useWorkspaces();
  const notebooks = useNotebooks();
  const monitors = useMonitors();
  const unreadChanges = monitors?.reduce((n, m) => n + m.unread, 0) ?? 0;
  const nbId = hash.startsWith('/study/') ? hash.slice('/study/'.length) : null;
  const wsId = hash.startsWith('/workspace/') ? hash.slice('/workspace/'.length) : null;
  useEmbeddingBackfill(settings, status.statuses, captures);

  useEffect(() => {
    const title = SECTIONS.find(([h]) => h === hash)?.[1];
    document.title = title ? `${title} · Eidetic` : capId ? 'Capture · Eidetic' : hash.startsWith('/workspace') ? 'Workspaces · Eidetic' : 'Library · Eidetic';
  }, [hash, capId]);

  if (!settings) return <div className="ws" />;

  return (
    <div className="ws">
      <header className="ws-head">
        <a href="#/library" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Logo size={24} />
          <span className="serif wordmark">Eidetic</span>
        </a>
        <form
          className="input-group"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            location.hash = '/library';
          }}
        >
          <label htmlFor="ws-q" className="sr-only">
            Search your captures
          </label>
          <input
            id="ws-q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!hash.startsWith('/library')) location.hash = '/library';
            }}
            placeholder="Search your captures"
            autoComplete="off"
          />
        </form>
      </header>
      <div className="ws-body">
        <nav className="ws-nav" aria-label="Workspace">
          <a href="#/library" aria-current={hash === '/library' || capId ? 'page' : undefined}>
            <IconLibrary size={16} /> Library
          </a>
          <a href="#/workspaces" aria-current={hash === '/workspaces' || wsId ? 'page' : undefined}>
            Workspaces
          </a>
          <a href="#/study" aria-current={hash === '/study' || nbId ? 'page' : undefined}>
            Study
          </a>
          <a href="#/monitor" aria-current={hash === '/monitor' ? 'page' : undefined}>
            Monitor {unreadChanges ? <span className="badge-tag">{unreadChanges}</span> : null}
          </a>
          <div className="eyebrow">Settings</div>
          {SECTIONS.map(([h, label]) => (
            <a key={h} href={`#${h}`} aria-current={hash === h ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <main className="ws-main">
          {hash.startsWith('/compare/') ? <ComparePage ids={hash.slice('/compare/'.length).split(',')} captures={captures} settings={settings} statuses={status.statuses} toast={show} /> : null}
          {hash === '/monitor' ? <MonitorPage monitors={monitors} toast={show} /> : null}
          {hash === '/study' ? <StudyList notebooks={notebooks} workspaces={workspaces ?? []} toast={show} /> : null}
          {nbId ? <StudyDetail id={nbId} notebooks={notebooks} settings={settings} statuses={status.statuses} toast={show} /> : null}
          {hash === '/workspaces' ? <WorkspacesPage workspaces={workspaces} captures={captures} toast={show} /> : null}
          {wsId ? <WorkspaceDetail id={wsId} workspaces={workspaces} captures={captures} toast={show} /> : null}
          {hash === '/library' ? <LibraryPage workspaces={workspaces ?? []} captures={captures} query={query} toast={show} settings={settings} statuses={status.statuses} /> : null}
          {capId ? (
            <div className="ws-page narrow">
              <a href="#/library" className="small">
                ‹ Library
              </a>
              {cap ? <ResultView capture={cap} settings={settings} statuses={status.statuses} toast={show} wide onDeleted={() => (location.hash = '/library')} /> : cap === null ? <p>This capture no longer exists.</p> : null}
            </div>
          ) : null}
          {hash === '/settings/ai' ? <AiModels settings={settings} {...status} toast={show} captures={captures} /> : null}
          {hash === '/settings/privacy' ? <Privacy settings={settings} /> : null}
          {hash === '/settings/appearance' ? <Appearance settings={settings} /> : null}
          {hash === '/settings/capture' ? <CaptureSettings settings={settings} toast={show} /> : null}
          {hash === '/settings/storage' ? <Storage settings={settings} toast={show} captures={captures} workspaces={workspaces ?? []} /> : null}
          {hash === '/settings/cleanup' ? <CleanupPage captures={captures} settings={settings} toast={show} /> : null}
        </main>
      </div>
      <Toast message={toast} />
    </div>
  );
}
