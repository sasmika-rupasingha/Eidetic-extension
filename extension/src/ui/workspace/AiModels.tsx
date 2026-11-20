/** Settings › AI models: mode, profile, providers (connect, test, remove), discovered models, and who handles each task. */
import { useState } from 'react';
import { downloadBuiltin } from '../../ai/builtin';
import { offlineHint, type ProviderStatus } from '../../ai/hub';
import { requestProviderPermission } from '../../ai/permissions';
import { PROFILE_LABEL, PROFILE_STYLE } from '../../ai/prompts';
import { candidates, isRoute, route } from '../../ai/router';
import { describeError, readyMap, testModel, type Statuses } from '../../ai/run';
import { cleanBaseUrl, PROFILE_STYLE_MAX, PROVIDER_IDS, PROVIDER_INFO, TASK_CLASS_LABEL, TASK_CLASSES, isLocal, updateSettings, type Mode, type ProfileId, type ProviderId, type Settings } from '../../store/settings';
import { IconLock, IconRefresh } from '../design/icons';
import { SemanticSettings } from './SemanticSettings';
import type { Capture } from '../../store/captures';

const MODES: Array<[Mode, string, string]> = [
  ['auto', 'Auto', 'Picks the best ready model for each task.'],
  ['manual', 'Manual', 'You choose the model for each kind of task.'],
  ['private', 'Private', 'Only models on this computer. Nothing goes to the cloud.'],
];

const gb = (b?: number) => (b ? `${(b / 1e9).toFixed(1)} GB` : '—');
const ctx = (n?: number) => (n ? (n >= 1000 ? `${Math.round(n / 1024)}K` : String(n)) : '—');

function dotClass(st?: ProviderStatus): string {
  if (!st) return 'off';
  if (st.state === 'ready') return 'ok';
  if (st.state === 'offline' || st.state === 'no-permission' || st.state === 'refused') return 'warn';
  if (st.state === 'error') return 'err';
  return 'off';
}

/**
 * Edits the chosen profile's answer style in the user's own words. Only this line of the instructions is editable: the
 * rules around it (captured content is untrusted data, Markdown, no invented facts) always stay.
 */
function ProfileStyleEditor({ profile, custom, toast }: { profile: ProfileId; custom?: string; toast: (m: string) => void }) {
  const [draft, setDraft] = useState(custom ?? PROFILE_STYLE[profile]);
  const saved = custom ?? PROFILE_STYLE[profile];
  const changed = draft.trim() !== saved;
  const save = () =>
    void updateSettings((cur) => {
      const v = draft.trim().slice(0, PROFILE_STYLE_MAX);
      if (!v || v === PROFILE_STYLE[profile]) delete cur.profileStyles[profile];
      else cur.profileStyles[profile] = v;
    }).then(() => toast(`${PROFILE_LABEL[profile]} style saved.`));
  const reset = () => {
    setDraft(PROFILE_STYLE[profile]);
    void updateSettings((cur) => void delete cur.profileStyles[profile]).then(() => toast(`${PROFILE_LABEL[profile]} style reset.`));
  };
  return (
    <div className="field" data-testid="profile-style">
      <label htmlFor="profile-style" className="label">
        How the {PROFILE_LABEL[profile]} style should answer {custom ? <span className="help">(your wording)</span> : null}
      </label>
      <textarea id="profile-style" className="input" value={draft} maxLength={PROFILE_STYLE_MAX} onChange={(e) => setDraft(e.target.value)} aria-describedby="profile-style-help" />
      <span id="profile-style-help" className="help">
        Added to every AI request in this style. Eidetic’s own rules stay in place: captured text is treated as data, never as instructions. {draft.length}/{PROFILE_STYLE_MAX}
      </span>
      <div className="row-gap">
        <button type="button" className="btn small" onClick={save} disabled={!changed || !draft.trim()}>
          Save style
        </button>
        <button type="button" className="btn small ghost" onClick={reset} disabled={!custom}>
          Reset to default
        </button>
      </div>
    </div>
  );
}

export function AiModels({ settings: s, statuses, checking, refresh, toast, captures }: { settings: Settings; statuses: Statuses; checking: boolean; refresh: (only?: ProviderId) => Promise<void>; toast: (m: string) => void; captures?: Capture[] | null }) {
  const [open, setOpen] = useState<ProviderId | null>(null);
  const [form, setForm] = useState<{ apiKey: string; baseUrl: string }>({ apiKey: '', baseUrl: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, string>>({});
  const [download, setDownload] = useState<number | null>(null);
  const ready = readyMap(statuses);

  const openForm = (id: ProviderId) => {
    setOpen(open === id ? null : id);
    setForm({ apiKey: s.providers[id].apiKey, baseUrl: s.providers[id].baseUrl });
  };

  /** Connect from a click: the permission prompt must come first, before any other await. */
  const connect = async (id: ProviderId) => {
    const baseUrl = id === 'builtin' ? '' : cleanBaseUrl(form.baseUrl || s.providers[id].baseUrl);
    if (id !== 'builtin' && !baseUrl) return toast('Enter a valid address starting with http:// or https://');
    if (PROVIDER_INFO[id].needsKey && !form.apiKey.trim()) return toast('Paste your API key first');
    const cfg = { ...s.providers[id], baseUrl, apiKey: form.apiKey.trim() };
    const ok = await requestProviderPermission(id, cfg);
    if (!ok) return toast(`Eidetic needs permission to contact ${PROVIDER_INFO[id].name}`);
    setBusy(id);
    await updateSettings((cur) => {
      cur.providers[id] = { ...cur.providers[id], enabled: true, baseUrl, apiKey: cfg.apiKey };
    });
    await refresh(id);
    setBusy(null);
    setOpen(null);
  };

  const quickConnect = async (id: ProviderId) => {
    const cfg = s.providers[id];
    const ok = await requestProviderPermission(id, cfg);
    if (!ok) return toast(`Eidetic needs permission to contact ${PROVIDER_INFO[id].name}`);
    setBusy(id);
    await updateSettings((cur) => void (cur.providers[id].enabled = true));
    await refresh(id);
    setBusy(null);
  };

  const remove = async (id: ProviderId) => {
    await updateSettings((cur) => {
      cur.providers[id] = { ...cur.providers[id], enabled: false, apiKey: '', models: [], defaultModel: '' };
      for (const t of TASK_CLASSES) if (cur.manual[t]?.provider === id) delete cur.manual[t];
    });
    await refresh();
    setOpen(null);
    toast(`${PROVIDER_INFO[id].name} disconnected${PROVIDER_INFO[id].needsKey ? ' and its key deleted' : ''}`);
  };

  const runTest = async (id: ProviderId, model: string) => {
    const key = `${id}:${model}`;
    setTests((t) => ({ ...t, [key]: 'Testing…' }));
    try {
      const r = await testModel(id, model, s);
      setTests((t) => ({ ...t, [key]: `Works · ${(r.ms / 1000).toFixed(1)} s` }));
    } catch (e) {
      setTests((t) => ({ ...t, [key]: describeError(e).message }));
    }
  };

  const actionFor = (id: ProviderId) => {
    const st = statuses[id];
    const info = PROVIDER_INFO[id];
    if (id === 'builtin') {
      if (st?.state === 'needs-setup')
        return (
          <button
            type="button"
            className="btn small soft"
            disabled={download !== null}
            onClick={() => {
              setDownload(0);
              void downloadBuiltin((f) => setDownload(f))
                .then(() => refresh('builtin'))
                .catch((e) => toast(describeError(e).message))
                .finally(() => setDownload(null));
            }}
          >
            {download !== null ? `Downloading ${Math.round(download * 100)}%` : 'Download (≈4 GB)'}
          </button>
        );
      if (st?.state === 'ready')
        return (
          <button type="button" className="btn small" onClick={() => void runTest('builtin', 'gemini-nano')}>
            Test
          </button>
        );
      return null;
    }
    if (!s.providers[id].enabled) {
      if (info.local)
        return (
          <button type="button" className="btn small soft" disabled={busy === id} onClick={() => void quickConnect(id)}>
            Connect
          </button>
        );
      return (
        <button type="button" className="btn small soft" aria-expanded={open === id} onClick={() => openForm(id)}>
          {info.needsKey ? 'Add key' : 'Add'}
        </button>
      );
    }
    if (st && st.state !== 'ready' && info.local)
      return (
        <span className="row-gap tight">
          <button type="button" className="btn small" disabled={busy === id || checking} onClick={() => void (st.state === 'no-permission' ? quickConnect(id) : refresh(id))}>
            {st.state === 'no-permission' ? 'Connect' : 'Retry'}
          </button>
          <button type="button" className="btn small ghost" aria-expanded={open === id} onClick={() => openForm(id)}>
            Manage
          </button>
        </span>
      );
    return (
      <button type="button" className="btn small" aria-expanded={open === id} onClick={() => openForm(id)}>
        Manage
      </button>
    );
  };

  const setMode = (mode: Mode) => void updateSettings((cur) => void (cur.mode = mode));
  const all = candidates({ ...s, mode: s.mode === 'private' ? 'private' : 'auto' }, ready);

  return (
    <div className="ws-page">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="page-title">AI models</h1>
        <p className="page-intro">Eidetic works without AI: capture, text recognition, tables, links and search all run offline. Connect a model to explain, solve and summarise. Models on this computer keep everything here.</p>
      </div>

      <section className="ws-section" aria-labelledby="mode-h">
        <h2 id="mode-h">Mode</h2>
        <div className="seg" role="radiogroup" aria-labelledby="mode-h">
          {MODES.map(([m, t, d]) => (
            <button key={m} type="button" role="radio" aria-checked={s.mode === m} onClick={() => setMode(m)}>
              <span className="t">{t}</span>
              <span className="d">{d}</span>
            </button>
          ))}
        </div>
        {s.mode === 'private' ? (
          <div className="note accent" role="status">
            <IconLock size={16} />
            <span>Private mode is on. Cloud providers are switched off, and captures never leave this computer, even if you press an AI action.</span>
          </div>
        ) : null}
        <div className="form-row">
          <label className="field">
            <span className="label">Answer style</span>
            <select className="input" value={s.profile} onChange={(e) => void updateSettings((cur) => void (cur.profile = e.target.value as ProfileId))}>
              {(Object.keys(PROFILE_LABEL) as ProfileId[]).map((p) => (
                <option key={p} value={p}>
                  {PROFILE_LABEL[p]}
                </option>
              ))}
            </select>
            <span className="help">Study: simple steps and examples. Developer: exact commands. Research: separates claims from interpretation. Writing: clarity and wording.</span>
          </label>
          <label className="check" style={{ alignSelf: 'center' }}>
            <input type="checkbox" checked={s.sendImages} onChange={(e) => void updateSettings((cur) => void (cur.sendImages = e.target.checked))} />
            <span>
              Send the image to models that can see
              <span className="help" style={{ display: 'block' }}>
                Off: only the recognised text is sent.
              </span>
            </span>
          </label>
        </div>
        <ProfileStyleEditor key={s.profile} profile={s.profile} custom={s.profileStyles[s.profile]} toast={toast} />
      </section>

      <section className="ws-section" aria-labelledby="prov-h">
        <div className="section-head" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <h2 id="prov-h" className="h-section" style={{ fontSize: 15 }}>
            Providers
          </h2>
          <button type="button" className="btn ghost small" onClick={() => void refresh()} disabled={checking}>
            <IconRefresh size={14} /> {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
        <div className="table-scroll">
          <table className="data act">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Where it runs</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {PROVIDER_IDS.map((id) => {
                const info = PROVIDER_INFO[id];
                const cfg = s.providers[id];
                const st = statuses[id];
                const off = s.mode === 'private' && !isLocal(id, cfg);
                const status = off ? 'Off in Private mode' : id !== 'builtin' && !cfg.enabled ? 'Not set up' : (st?.message ?? 'Checking…');
                const hint = off ? '' : st?.state === 'offline' && info.local ? offlineHint(id) : st?.hint;
                return [
                  <tr key={id}>
                    <td>
                      <strong>{info.name}</strong>
                      <div className="note-line">{info.note}</div>
                    </td>
                    <td>
                      <div>{info.where}</div>
                      <div className="sub">{id === 'builtin' ? 'Inside Chrome' : cfg.baseUrl || 'Address you enter'}</div>
                    </td>
                    <td>
                      <div className="row-gap">
                        <span className={`dot ${off ? 'off' : dotClass(st)}`} />
                        <span>{status}</span>
                      </div>
                      {hint ? <div className="small muted" style={{ marginTop: 3 }}>{hint}</div> : null}
                      {tests[`${id}:gemini-nano`] && id === 'builtin' ? <div className="small muted">{tests['builtin:gemini-nano']}</div> : null}
                    </td>
                    <td>{off ? null : actionFor(id)}</td>
                  </tr>,
                  open === id ? (
                    <tr key={`${id}-form`}>
                      <td colSpan={4} style={{ borderTop: 0, paddingTop: 0 }}>
                        <div className="provider-form">
                          <div className="form-row">
                            {info.needsKey || id === 'custom' ? (
                              <label className="field">
                                <span className="label">API key{id === 'custom' ? ' (if the server needs one)' : ''}</span>
                                <input className="input" type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={info.needsKey ? 'Paste your key' : 'Optional'} />
                                {info.keyUrl ? (
                                  <span className="help">
                                    Get one at{' '}
                                    <a href={info.keyUrl} target="_blank" rel="noreferrer">
                                      {new URL(info.keyUrl).hostname}
                                    </a>
                                    . Stored only in this browser; sent only to {info.name}.
                                  </span>
                                ) : null}
                              </label>
                            ) : null}
                            <label className="field">
                              <span className="label">Server address</span>
                              <input className="input" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://…" />
                              <span className="help">{info.local ? 'Change only if you moved the server to another port.' : id === 'custom' ? 'The base URL, usually ending in /v1.' : 'Leave as it is unless you use a proxy.'}</span>
                            </label>
                            {cfg.enabled && st?.state === 'ready' ? (
                              <label className="field">
                                <span className="label">{info.local ? 'Default model' : 'Model to use'}</span>
                                <select className="input" value={cfg.defaultModel || st.models[0]?.id || ''} onChange={(e) => void updateSettings((cur) => void (cur.providers[id].defaultModel = e.target.value))}>
                                  {st.models.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.id}
                                    </option>
                                  ))}
                                </select>
                                {!info.local ? <span className="help">Only this model is used from {info.name}, so costs stay predictable.</span> : null}
                              </label>
                            ) : null}
                          </div>
                          {id === 'ollama' ? <div className="small muted">If Ollama refuses the extension, set the environment variable OLLAMA_ORIGINS to chrome-extension://*,moz-extension://* and restart Ollama.</div> : null}
                          <div className="row-gap wrap">
                            <button type="button" className="btn small primary" style={{ fontSize: 13 }} disabled={busy === id} onClick={() => void connect(id)}>
                              {busy === id ? 'Connecting…' : cfg.enabled ? 'Save and reconnect' : 'Connect'}
                            </button>
                            {cfg.enabled ? (
                              <button type="button" className="btn small ghost danger" onClick={() => void remove(id)}>
                                Disconnect{info.needsKey ? ' and delete key' : ''}
                              </button>
                            ) : null}
                            <button type="button" className="btn small ghost" onClick={() => setOpen(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(['ollama', 'lmstudio', 'custom'] as const).map((id) =>
        ready[id]?.length && isLocal(id, s.providers[id]) ? (
          <section key={id} className="ws-section" aria-label={`${PROVIDER_INFO[id].name} models`}>
            <div className="section-head" style={{ borderBottom: 0, paddingBottom: 0 }}>
              <h2 className="h-section" style={{ fontSize: 15 }}>
                {PROVIDER_INFO[id].name} models
              </h2>
              <span className="meta">{s.providers[id].baseUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="table-scroll">
              <table className="data act">
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    <th scope="col">Can handle</th>
                    <th scope="col">Context</th>
                    <th scope="col">Size</th>
                    <th scope="col">
                      <span className="sr-only">Test</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ready[id]!.map((m) => (
                    <tr key={m.id}>
                      <td className="mono" style={{ fontSize: 13 }}>
                        {m.id}
                      </td>
                      <td>
                        <span className="cap">Text</span>
                        {m.vision === true ? <span className="cap">Vision</span> : m.vision === null ? <span className="cap muted" title="Not known yet; checked the first time an image is sent">Vision ?</span> : null}
                        {m.code ? <span className="cap">Code</span> : null}
                      </td>
                      <td className="mono muted">{ctx(m.context)}</td>
                      <td className="mono muted">{m.bytes ? gb(m.bytes) : m.sizeB ? `${m.sizeB}B params` : '—'}</td>
                      <td>
                        <span className="row-gap">
                          {tests[`${id}:${m.id}`] ? <span className="small muted">{tests[`${id}:${m.id}`]}</span> : null}
                          <button type="button" className="btn small" onClick={() => void runTest(id, m.id)}>
                            Test
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null,
      )}

      <section className="ws-section" aria-labelledby="route-h">
        <div className="section-head" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <h2 id="route-h" className="h-section" style={{ fontSize: 15 }}>
            Who handles each task
          </h2>
          <span className="small muted">{s.mode === 'manual' ? 'Choose a model for each kind of task.' : 'Chosen automatically. Switch to Manual to change.'}</span>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Handled by</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Copy text, QR codes, tables, dates, privacy checks</td>
                <td className="mono">This computer, no AI</td>
                <td className="muted">Always done locally</td>
              </tr>
              {TASK_CLASSES.map((cls) => {
                const r = route(cls, s, ready, { hasImage: cls === 'vision' });
                const choice = s.manual[cls];
                return (
                  <tr key={cls}>
                    <td>{TASK_CLASS_LABEL[cls]}</td>
                    <td className="mono">
                      {s.mode === 'manual' ? (
                        <select
                          className="input"
                          aria-label={`Model for ${TASK_CLASS_LABEL[cls]}`}
                          value={choice ? `${choice.provider}|${choice.model}` : ''}
                          onChange={(e) =>
                            void updateSettings((cur) => {
                              const [provider, ...rest] = e.target.value.split('|');
                              if (!provider) delete cur.manual[cls];
                              else cur.manual[cls] = { provider: provider as ProviderId, model: rest.join('|') };
                            })
                          }
                        >
                          <option value="">Automatic</option>
                          {all.map((c) => (
                            <option key={`${c.provider}|${c.model.id}`} value={`${c.provider}|${c.model.id}`}>
                              {c.provider === 'builtin' ? PROVIDER_INFO.builtin.name : `${PROVIDER_INFO[c.provider].name} · ${c.model.id}`}
                            </option>
                          ))}
                        </select>
                      ) : isRoute(r) ? (
                        r.provider === 'builtin' ? (
                          PROVIDER_INFO.builtin.name
                        ) : (
                          r.model
                        )
                      ) : (
                        <span className="muted">No model ready</span>
                      )}
                    </td>
                    <td className="muted">{isRoute(r) ? r.reason : r.hint}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <SemanticSettings settings={s} statuses={statuses} captures={captures ?? null} />
    </div>
  );
}
