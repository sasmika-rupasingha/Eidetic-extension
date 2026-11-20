/** Settings › Privacy and Settings › Appearance. */
import { updateSettings, type Accent, type Settings, type ThemePref } from '../../store/settings';
import { IconLock, IconShield } from '../design/icons';

export function Privacy({ settings: s }: { settings: Settings }) {
  return (
    <div className="ws-page narrow">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Privacy</h1>
        <p className="page-intro">Eidetic has no server and no account, and collects no analytics. This page says exactly where your data is and when it leaves this computer.</p>
      </div>
      <section className="ws-section">
        <h2>Private mode</h2>
        <label className="check">
          <input type="checkbox" checked={s.mode === 'private'} onChange={(e) => void updateSettings((cur) => void (cur.mode = e.target.checked ? 'private' : 'auto'))} />
          <span>
            Only use AI on this computer (Ollama, LM Studio, Chrome built-in AI). Cloud providers are blocked even if you press an AI action.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.sendImages} onChange={(e) => void updateSettings((cur) => void (cur.sendImages = e.target.checked))} />
          <span>Send the captured image (not only its text) to models that can see images.</span>
        </label>
      </section>
      <section className="ws-section">
        <h2>Where your data is</h2>
        <dl className="kv">
          <dt>Captures, text, notes, answers</dt>
          <dd>In this browser’s storage on this computer (IndexedDB). Never uploaded by Eidetic.</dd>
          <dt>API keys</dt>
          <dd>In this browser’s extension storage. Sent only to their own provider.</dd>
          <dt>Text recognition</dt>
          <dd>Runs on this computer (WebAssembly). Extra languages are downloaded once from jsDelivr.</dd>
          <dt>Search</dt>
          <dd>Runs on this computer.</dd>
        </dl>
      </section>
      <section className="ws-section">
        <h2>When something leaves this computer</h2>
        <div className="note">
          <IconShield size={16} />
          <span>
            Only when you press an AI action that runs on a cloud provider you added. The answer area shows “Sends the text to …” before anything is sent. Automatic descriptions use local models only, never the cloud.
          </span>
        </div>
        <div className="note">
          <IconLock size={16} />
          <span>Page access: Eidetic sees a page only when you capture it (toolbar icon, Alt+Shift+E, the right-click menu, or sites you allowed).</span>
        </div>
      </section>
    </div>
  );
}

const THEMES: Array<[ThemePref, string, string]> = [
  ['system', 'System', 'Follows your computer'],
  ['light', 'Light', 'Warm paper'],
  ['dark', 'Dark', 'Graphite'],
];
const ACCENTS: Array<[Accent, string, string, string]> = [
  ['ultramarine', 'Ultramarine', '#2f45d8', '#97a3ff'],
  ['vermilion', 'Vermilion', '#b23a22', '#ff8f75'],
  ['moss', 'Moss', '#3b6726', '#a8d385'],
  ['graphite', 'Graphite', '#1a1916', '#ece9e2'],
];

export function Appearance({ settings: s }: { settings: Settings }) {
  return (
    <div className="ws-page narrow">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">Appearance</h1>
      </div>
      <section className="ws-section" aria-labelledby="theme-h">
        <h2 id="theme-h">Theme</h2>
        <div className="seg" role="radiogroup" aria-labelledby="theme-h">
          {THEMES.map(([t, label, d]) => (
            <button key={t} type="button" role="radio" aria-checked={s.theme === t} onClick={() => void updateSettings((cur) => void (cur.theme = t))}>
              <span className="t">{label}</span>
              <span className="d">{d}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="ws-section" aria-labelledby="accent-h">
        <h2 id="accent-h">Accent colour</h2>
        <div className="seg compact" role="radiogroup" aria-labelledby="accent-h">
          {ACCENTS.map(([a, label, light, dark]) => (
            <button key={a} type="button" role="radio" aria-checked={s.accent === a} onClick={() => void updateSettings((cur) => void (cur.accent = a))}>
              <span className="row-gap">
                <span className="dot" style={{ width: 14, height: 14, background: document.documentElement.dataset.theme === 'dark' ? dark : light }} />
                <span className="t">{label}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="small muted">Used only for the main action, the current place and highlights.</p>
      </section>
    </div>
  );
}
