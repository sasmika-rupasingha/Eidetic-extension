/** Settings › Capture and languages: shortcuts, text-recognition languages, translation, search engine, temporary captures. */
import { useEffect, useState } from 'react';
import { downloadLanguage, isLanguageReady, removeLanguage } from '../../ocr/ocr';
import { OCR_LANGUAGES, TRANSLATE_LANGUAGES, updateSettings, type Settings } from '../../store/settings';

export function CaptureSettings({ settings: s, toast }: { settings: Settings; toast: (m: string) => void }) {
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([]);

  useEffect(() => {
    void Promise.all(Object.keys(OCR_LANGUAGES).map(async (c) => [c, await isLanguageReady(c)] as const)).then((r) => setReady(Object.fromEntries(r)));
    void chrome.commands?.getAll?.().then(setShortcuts).catch(() => undefined);
  }, []);

  const toggleLang = async (code: string, on: boolean) => {
    if (on && !ready[code]) {
      setBusy((b) => ({ ...b, [code]: 0 }));
      try {
        await downloadLanguage(code, (f) => setBusy((b) => ({ ...b, [code]: f })));
        setReady((r) => ({ ...r, [code]: true }));
      } catch (e) {
        toast((e as Error).message);
        setBusy(({ [code]: _x, ...rest }) => rest);
        return;
      }
      setBusy(({ [code]: _x, ...rest }) => rest);
    }
    await updateSettings((cur) => {
      const set = new Set(cur.ocrLanguages);
      if (on) set.add(code);
      else set.delete(code);
      cur.ocrLanguages = set.size ? [...set].slice(0, 4) : ['eng'];
    });
  };

  return (
    <div className="ws-page narrow">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Capture and languages</h1>
      </div>

      <section className="ws-section">
        <h2>Keyboard shortcuts</h2>
        <dl className="kv">
          {shortcuts.map((c) => (
            <div key={c.name} style={{ display: 'contents' }}>
              <dt>{c.name === '_execute_action' ? 'Open Eidetic' : c.description}</dt>
              <dd className="mono">{c.shortcut || 'Not set'}</dd>
            </div>
          ))}
        </dl>
        <div>
          <button type="button" className="btn small" onClick={() => void chrome.tabs.create({ url: navigator.userAgent.includes('Firefox') ? 'about:addons' : 'chrome://extensions/shortcuts' })}>
            Change shortcuts
          </button>
        </div>
      </section>

      <section className="ws-section">
        <h2>Text recognition languages</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Choose up to four. English is built in; others download once (a few MB) and then work offline. Fewer languages read faster and more accurately.
        </p>
        <div className="form-row">
          {Object.entries(OCR_LANGUAGES).map(([code, name]) => (
            <label key={code} className="check">
              <input type="checkbox" checked={s.ocrLanguages.includes(code)} disabled={code in busy || (!s.ocrLanguages.includes(code) && s.ocrLanguages.length >= 4)} onChange={(e) => void toggleLang(code, e.target.checked)} />
              <span>
                {name}
                <span className="small muted">
                  {' '}
                  {code in busy ? `downloading ${Math.round((busy[code] ?? 0) * 100)}%` : code === 'eng' ? 'built in' : ready[code] ? 'downloaded' : ''}
                </span>
                {ready[code] && code !== 'eng' && !s.ocrLanguages.includes(code) ? (
                  <button type="button" className="linkish small" style={{ marginLeft: 8 }} onClick={() => void removeLanguage(code).then(() => setReady((r) => ({ ...r, [code]: false })))}>
                    remove
                  </button>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="ws-section">
        <h2>Translation and search</h2>
        <div className="form-row">
          <label className="field">
            <span className="label">Translate into</span>
            <select className="input" value={s.translateTo} onChange={(e) => void updateSettings((cur) => void (cur.translateTo = e.target.value))}>
              {Object.entries(TRANSLATE_LANGUAGES).map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Search the web with</span>
            <select className="input" value={s.searchEngine} onChange={(e) => void updateSettings((cur) => void (cur.searchEngine = e.target.value as Settings['searchEngine']))}>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
              <option value="duckduckgo">DuckDuckGo</option>
            </select>
          </label>
        </div>
      </section>

      <section className="ws-section">
        <h2>Temporary captures</h2>
        <label className="field">
          <span className="label">Remove captures you didn’t keep after</span>
          <select className="input" style={{ maxWidth: 260 }} value={s.tempDays} onChange={(e) => void updateSettings((cur) => void (cur.tempDays = Number(e.target.value)))}>
            {[1, 3, 7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? '' : 's'}
              </option>
            ))}
            <option value={0}>Never</option>
          </select>
          <span className="help">A capture is kept forever once you press Keep, pin it, add a note or use an AI action on it.</span>
        </label>
      </section>
    </div>
  );
}
