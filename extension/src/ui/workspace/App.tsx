/** The workspace tab: the library at full width, capture details, and settings. Routes live in the URL hash. */
import { useEffect, useState } from 'react';
import { IconLibrary, Logo } from '../design/icons';
import { Toast } from '../shared/components';
import { useCapture, useCaptures, useSettings, useStatuses, useToast } from '../shared/hooks';
import { ResultView } from '../shared/ResultView';
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

  useEffect(() => {
    const title = SECTIONS.find(([h]) => h === hash)?.[1];
    document.title = title ? `${title} · Eidetic` : capId ? 'Capture · Eidetic' : 'Library · Eidetic';
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
          <div className="eyebrow">Settings</div>
          {SECTIONS.map(([h, label]) => (
            <a key={h} href={`#${h}`} aria-current={hash === h ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <main className="ws-main">
          {hash === '/library' ? <LibraryPage captures={captures} query={query} toast={show} /> : null}
          {capId ? (
            <div className="ws-page narrow">
              <a href="#/library" className="small">
                ‹ Library
              </a>
              {cap ? <ResultView capture={cap} settings={settings} statuses={status.statuses} toast={show} wide onDeleted={() => (location.hash = '/library')} /> : cap === null ? <p>This capture no longer exists.</p> : null}
            </div>
          ) : null}
          {hash === '/settings/ai' ? <AiModels settings={settings} {...status} toast={show} /> : null}
          {hash === '/settings/privacy' ? <Privacy settings={settings} /> : null}
          {hash === '/settings/appearance' ? <Appearance settings={settings} /> : null}
          {hash === '/settings/capture' ? <CaptureSettings settings={settings} toast={show} /> : null}
          {hash === '/settings/storage' ? <Storage settings={settings} toast={show} /> : null}
        </main>
      </div>
      <Toast message={toast} />
    </div>
  );
}
