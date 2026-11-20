/** Capture home: what tab you're on, one clear Capture button, other ways in, and recent captures. */
import { useEffect, useRef, useState } from 'react';
import { activeTab, RESTRICTED, saveBlob } from '../../capture/capture';
import { BROWSER_NAME, IS_FIREFOX } from '../../shared/browser';
import { siteOf, type Capture } from '../../store/captures';
import { IconCapture, IconInfo, IconLock } from '../design/icons';
import { CaptureRow, Empty } from '../shared/components';

export interface AccessHelp {
  mode: 'area' | 'full';
  /**
   * Why the page can't be captured:
   * - `ask`: Eidetic hasn't been given access yet (offer the shortcut or "Allow on all sites").
   * - `browser-page`: Eidetic is allowed on all sites, yet Chrome still hides the page's address, so it's a page outside
   *   "all sites": the new tab page, a chrome:// page, the Web Store, or a local file without file access.
   * - `blocked`: Eidetic can see the page but Chrome still refuses (site settings, a policy, or a page opened earlier).
   */
  reason: 'ask' | 'browser-page' | 'blocked';
}

export function Home({
  captures,
  selecting,
  access,
  captureError,
  onDismissError,
  onCapture,
  onAllowAll,
  onOpen,
  onLibrary,
  toast,
}: {
  captures: Capture[] | null;
  selecting: boolean;
  access: AccessHelp | null;
  captureError: string | null;
  onDismissError: () => void;
  onCapture: (mode: 'area' | 'full') => void;
  onAllowAll: () => void;
  onOpen: (id: string) => void;
  onLibrary: () => void;
  toast: (m: string) => void;
}) {
  const [tab, setTab] = useState<{ title?: string; url?: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => void activeTab().then((t) => setTab(t ? { title: t.title, url: t.url } : null));
    load();
    chrome.tabs.onActivated.addListener(load);
    chrome.tabs.onUpdated.addListener(load);
    return () => {
      chrome.tabs.onActivated.removeListener(load);
      chrome.tabs.onUpdated.removeListener(load);
    };
  }, []);

  const restricted = Boolean(tab?.url && RESTRICTED.test(tab.url));
  const known = Boolean(tab?.url);

  const paste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) {
          await saveBlob(await it.getType(type), { url: '', title: 'Pasted image', site: 'Clipboard' });
          return;
        }
      }
      toast('No image on the clipboard. Copy one, then press Ctrl+V here.');
    } catch {
      toast('Press Ctrl+V in the panel to paste an image.');
    }
  };

  return (
    <div className="home">
      <section aria-label="Capture" className="stack">
        <div className="viewfinder">
          <span className="vf tl" />
          <span className="vf tr" />
          <span className="vf bl" />
          <span className="vf br" />
          <div className="eyebrow">This tab</div>
          {known ? (
            <>
              <div className="serif vf-title">{tab?.title || 'Untitled page'}</div>
              <div className="meta">{siteOf(tab!.url!)}</div>
            </>
          ) : (
            <div className="serif vf-title">Capture anything visible on the page</div>
          )}
          <div className="vf-note small muted">
            {restricted ? (
              <>
                <IconInfo size={15} />
                <span>Browser pages and extension stores can’t be captured. Open a normal web page.</span>
              </>
            ) : selecting ? (
              <>
                <span className="spinner" />
                <span>Select an area on the page. Press Esc to cancel.</span>
              </>
            ) : (
              <>
                <IconLock size={15} />
                <span>{known ? 'Captures stay on this computer. Text is read offline.' : `Eidetic only sees a page when you capture it. ${BROWSER_NAME} may ask once per site.`}</span>
              </>
            )}
          </div>
        </div>

        {captureError ? (
          <div className="note err" role="alert" data-testid="capture-error">
            <IconInfo size={16} />
            <div className="stack tight">
              <div>Couldn’t capture: {captureError}</div>
              <div className="row-gap">
                <button type="button" className="btn small" onClick={() => onCapture('area')}>
                  Try again
                </button>
                <button type="button" className="btn small ghost" onClick={onDismissError}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {access && access.reason !== 'ask' ? (
          <div className="note accent" role="alert" data-testid="access-help" data-reason={access.reason}>
            <IconInfo size={16} />
            <div className="stack tight">
              {access.reason === 'browser-page' ? (
                IS_FIREFOX ? (
                  <>
                    <div>Firefox doesn’t let extensions capture this page. It’s one of:</div>
                    <ul className="plain">
                      <li>a new tab, or a Firefox page such as Settings or Add-ons (about:…): open a normal website and capture there,</li>
                      <li>the Firefox Add-ons site, or</li>
                      <li>a file on your computer: paste a screenshot of it into this panel instead (Ctrl+V).</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <div>Chrome doesn’t let extensions capture this page. It’s one of:</div>
                    <ul className="plain">
                      <li>a new tab, or a Chrome page such as Settings or Extensions: open a normal website and capture there,</li>
                      <li>the Chrome Web Store, or</li>
                      <li>a file on your computer: turn on “Allow access to file URLs” in Eidetic’s details.</li>
                    </ul>
                  </>
                )
              ) : (
                <>
                  <div>Eidetic is allowed on all sites, but {BROWSER_NAME} still blocks this page. Usually that’s because:</div>
                  <ul className="plain">
                    <li>the page opened before Eidetic was allowed: reload it and try again, or</li>
                    <li>{BROWSER_NAME}’s settings or your organisation block extensions on this site.</li>
                  </ul>
                </>
              )}
              <div className="row-gap wrap">
                <button type="button" className="btn small soft" onClick={() => onCapture(access.mode)}>
                  Try again
                </button>
                {IS_FIREFOX ? (
                  <span className="small muted">Eidetic’s settings in Firefox: menu › Add-ons and themes › Eidetic.</span>
                ) : (
                  <button type="button" className="btn small ghost" onClick={() => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })}>
                    Open Eidetic’s details
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : access ? (
          <div className="note accent" role="alert" data-testid="access-help">
            <IconInfo size={16} />
            <div className="stack tight">
              <div>{BROWSER_NAME} hasn’t given Eidetic access to this page yet. Either:</div>
              <ul className="plain">
                <li>
                  click the page, then press <span className="kbd">Alt</span> <span className="kbd">Shift</span> <span className="kbd">E</span> (or right-click › Capture an area), or
                </li>
                <li>allow Eidetic on all sites, so this button works everywhere.</li>
              </ul>
              <div>
                <button type="button" className="btn small soft" onClick={onAllowAll}>
                  Allow on all sites
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <button type="button" data-testid="capture" className="btn primary large" onClick={() => onCapture('area')} disabled={restricted || selecting}>
          <span className="row-gap">
            <IconCapture size={18} />
            Capture an area
          </span>
          <span className="mono small">Alt Shift E</span>
        </button>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => onCapture('full')} disabled={restricted || selecting}>
            Full screen
          </button>
          <button type="button" className="btn" onClick={() => void paste()}>
            Paste image
          </button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Open file
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void saveBlob(f, { url: '', title: f.name, site: 'File' });
              e.target.value = '';
            }}
          />
        </div>
      </section>

      <section aria-label="Recent captures" className="recent">
        <div className="section-head">
          <h2 className="h-section">Recent</h2>
          {captures?.length ? (
            <button type="button" className="linkish small" onClick={onLibrary}>
              Library ›
            </button>
          ) : null}
        </div>
        {captures === null ? null : captures.length ? (
          captures.slice(0, 4).map((c) => <CaptureRow key={c.id} capture={c} onOpen={() => onOpen(c.id)} />)
        ) : (
          <Empty title="Nothing captured yet">Capture part of any page: a slide, an error, a table, a poster. Eidetic reads it and suggests what to do next.</Empty>
        )}
      </section>
    </div>
  );
}
