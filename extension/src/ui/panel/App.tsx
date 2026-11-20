/** The side panel: Capture · Library · Ask, with the capture result as a screen inside Capture. */
import { useCallback, useEffect, useState } from 'react';
import { AccessError, activeTab, captureTab, saveBlob, SESSION_LATEST, type CaptureOptions, type LatestCapture } from '../../capture/capture';
import { readyMap } from '../../ai/run';
import { expireTemporary } from '../../store/captures';
import { PROVIDER_INFO, updateSettings } from '../../store/settings';
import { IconAsk, IconCapture, IconExpand, IconLibrary, IconSettings, Logo } from '../design/icons';
import { Toast } from '../shared/components';
import { useEmbeddingBackfill } from '../shared/useMeaning';
import { startWatch } from '../../monitor/watch';
import { originOf } from '../../monitor/monitor';
import { useCapture, useCaptures, useSettings, useStatuses, useToast } from '../shared/hooks';
import { ResultView } from '../shared/ResultView';
import { AskView } from './AskView';
import { Home, type AccessHelp } from './Home';
import { LibraryView } from './LibraryView';
import { Onboarding } from './Onboarding';

type View = { name: 'home' } | { name: 'result'; id: string } | { name: 'library' } | { name: 'ask' };

const openWorkspace = (hash = '/library') => void chrome.tabs.create({ url: chrome.runtime.getURL(`workspace.html#${hash}`) });

export function App() {
  const settings = useSettings();
  const { statuses } = useStatuses(settings);
  const { captures } = useCaptures();
  const { toast, show } = useToast();
  const [view, setView] = useState<View>({ name: 'home' });
  const [selecting, setSelecting] = useState(false);
  const [access, setAccess] = useState<AccessHelp | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const resultCap = useCapture(view.name === 'result' ? view.id : null);
  useEmbeddingBackfill(settings, statuses, captures);

  /** One message for an access failure: the access help (never also the red error card). */
  const showAccess = useCallback(async (mode: 'area' | 'full') => {
    const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);
    // With access to all sites Chrome shows Eidetic every website's address; a hidden one means a browser page or a local file.
    const hidden = granted && !(await activeTab().catch(() => undefined))?.url;
    setCaptureError(null);
    setAccess({ mode, reason: !granted ? 'ask' : hidden ? 'browser-page' : 'blocked' });
  }, []);

  // Follow captures taken from the shortcut, the right-click menu or the panel.
  useEffect(() => {
    const onLatest = (v: LatestCapture | undefined) => {
      if (!v || Date.now() - v.at > 60_000) return;
      if ('selecting' in v) setSelecting(true);
      else {
        setSelecting(false);
        if ('id' in v) setView({ name: 'result', id: v.id });
        if ('error' in v) {
          if (v.access) void showAccess('area');
          else setCaptureError(v.error);
        }
        if ('id' in v) setCaptureError(null);
      }
    };
    void chrome.storage.session.get(SESSION_LATEST).then((g) => onLatest(g[SESSION_LATEST] as LatestCapture | undefined));
    const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes[SESSION_LATEST]) onLatest(changes[SESSION_LATEST].newValue as LatestCapture);
    };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }, [show, showAccess]);

  useEffect(() => {
    if (settings) void expireTemporary(settings.tempDays).catch(() => undefined);
  }, [settings?.tempDays]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(
    async (mode: 'area' | 'full', opts: CaptureOptions = {}) => {
      setAccess(null);
      setCaptureError(null);
      const tab = await activeTab();
      if (!tab) return show('No web page to capture in this window.');
      try {
        await captureTab(tab, mode, opts);
      } catch (e) {
        setSelecting(false);
        if (e instanceof AccessError) {
          // Chrome hides a page from extensions until the user allows it. If we know the site, ask for it alone.
          let origin: string | null = null;
          try {
            origin = tab.url ? `${new URL(tab.url).origin}/*` : null;
          } catch {
            origin = null;
          }
          if (origin && (await chrome.permissions.request({ origins: [origin] }).catch(() => false))) return void capture(mode, opts);
          await showAccess(mode);
        } else {
          console.warn('Eidetic capture failed:', e);
          setCaptureError((e as Error).message || String(e));
        }
      }
    },
    [show, showAccess],
  );

  /** "Watch part of this page": access to this site (needed to check it later), then point at the part to watch. */
  const watch = useCallback(async () => {
    const tab = await activeTab();
    if (!tab) return show('No web page to watch in this window.');
    const origin = tab.url ? originOf(tab.url) : null;
    if (!origin) return show('Eidetic can’t see this page’s address yet. Right-click the page and choose “Watch part of this page for changes”.');
    if (!(await chrome.permissions.contains({ origins: [origin] }).catch(() => false)) && !(await chrome.permissions.request({ origins: [origin] }).catch(() => false))) return show('Eidetic needs access to this site to check it for changes.');
    try {
      const m = await startWatch(tab);
      if (m) show(`Watching “${(m.title || m.site).slice(0, 40)}”. See Monitor in the workspace.`);
    } catch (e) {
      show((e as Error).message || 'Couldn’t start watching this page.');
    }
  }, [show]);

  /** "Allow on all sites": ask Chrome, then carry straight on with the capture the user wanted. */
  const allowAll = useCallback(async () => {
    const mode = access?.mode ?? 'area';
    const ok = await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
    if (!ok) {
      show('Not allowed. You can still capture with Alt+Shift+E on the page.');
      return;
    }
    setAccess(null);
    show('Allowed. Select an area on the page.');
    await capture(mode);
  }, [access, capture, show]);

  // Paste an image anywhere in the panel.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      void saveBlob(file, { url: '', title: 'Pasted image', site: 'Clipboard' });
    };
    addEventListener('paste', onPaste);
    return () => removeEventListener('paste', onPaste);
  }, []);

  if (!settings) return <div className="panel loading" />;

  const aiReady = Object.keys(readyMap(statuses)).length > 0;
  const firstReady = Object.entries(readyMap(statuses))[0];
  const tab = view.name === 'result' ? 'home' : view.name;

  return (
    <div
      className="panel"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (!file) return;
        e.preventDefault();
        void saveBlob(file, { url: '', title: file.name, site: 'File' });
      }}
    >
      <header className="p-head">
        <div className="brand">
          <Logo />
          <span className="serif wordmark">{view.name === 'library' ? 'Library' : view.name === 'ask' ? 'Ask' : 'Eidetic'}</span>
        </div>
        <div className="row-gap tight">
          <button type="button" className="btn ghost icon" aria-label="Open the full workspace" data-tip="Full workspace" onClick={() => openWorkspace(view.name === 'result' ? `/capture/${view.id}` : '/library')}>
            <IconExpand />
          </button>
          <button type="button" className="btn ghost icon" aria-label="Settings" data-tip="Settings" onClick={() => openWorkspace('/settings/ai')}>
            <IconSettings />
          </button>
        </div>
      </header>

      <main className="p-main">
        {!settings.onboarded ? <Onboarding aiReady={aiReady} onDone={() => void updateSettings((s) => void (s.onboarded = true))} onAi={() => openWorkspace('/settings/ai')} /> : null}
        {view.name === 'home' ? <Home captures={captures} selecting={selecting} access={access} captureError={captureError} onDismissError={() => setCaptureError(null)} onCapture={capture} onAllowAll={allowAll} onWatch={() => void watch()} onOpen={(id) => setView({ name: 'result', id })} onLibrary={() => setView({ name: 'library' })} toast={show} /> : null}
        {view.name === 'result' ? (
          resultCap ? (
            <>
              <div className="crumb">
                <button type="button" className="btn ghost small" onClick={() => setView({ name: 'home' })}>
                  ‹ Capture
                </button>
              </div>
              <ResultView capture={resultCap} settings={settings} statuses={statuses} toast={show} onDeleted={() => setView({ name: 'home' })} onOpen={(id) => setView({ name: 'result', id })} onRecapture={(opts) => void capture('area', opts)} />
            </>
          ) : resultCap === null ? (
            <div className="empty">This capture was deleted.</div>
          ) : null
        ) : null}
        {view.name === 'library' ? <LibraryView captures={captures} settings={settings} statuses={statuses} onOpen={(id) => setView({ name: 'result', id })} onWorkspace={() => openWorkspace('/library')} /> : null}
        {view.name === 'ask' ? <AskView captures={captures} settings={settings} statuses={statuses} toast={show} onOpen={(id) => setView({ name: 'result', id })} /> : null}
      </main>

      <div className="p-status" data-testid="ai-status">
        <span className="row-gap min0">
          <span className={`dot ${aiReady ? 'ok' : 'off'}`} />
          <span>{aiReady ? (firstReady && (PROVIDER_INFO[firstReady[0] as keyof typeof PROVIDER_INFO].local) ? 'Local AI ready' : 'AI ready') : 'No AI connected'}</span>
          <span className="meta ellipsis">{aiReady && firstReady ? `${PROVIDER_INFO[firstReady[0] as keyof typeof PROVIDER_INFO].name}${firstReady[1][0] && firstReady[0] !== 'builtin' ? ` · ${firstReady[1][0].id}` : ''}` : 'Everything else works offline'}</span>
        </span>
        <button type="button" className="mode-chip" onClick={() => openWorkspace('/settings/ai')} aria-label={`AI mode: ${settings.mode}. Change in settings`}>
          {settings.mode === 'auto' ? 'Auto' : settings.mode === 'manual' ? 'Manual' : 'Private'}
        </button>
      </div>

      <nav className="p-nav" aria-label="Sections">
        <button type="button" aria-current={tab === 'home' ? 'page' : undefined} onClick={() => setView({ name: 'home' })}>
          <IconCapture size={20} />
          Capture
        </button>
        <button type="button" aria-current={tab === 'library' ? 'page' : undefined} onClick={() => setView({ name: 'library' })}>
          <IconLibrary size={20} />
          Library
        </button>
        <button type="button" aria-current={tab === 'ask' ? 'page' : undefined} onClick={() => setView({ name: 'ask' })}>
          <IconAsk size={20} />
          Ask
        </button>
      </nav>
      <Toast message={toast} />
    </div>
  );
}
