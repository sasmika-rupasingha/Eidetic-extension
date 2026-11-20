/** Settings › AI models › Search by meaning: which local embedding model, and how many captures have a vector. */
import { useEffect, useState } from 'react';
import { EMBED_PROVIDERS, embedderKey, listEmbedModels, pickEmbedder, type Embedder } from '../../ai/embed';
import type { Statuses } from '../../ai/run';
import { PROVIDER_INFO, updateSettings, type Settings } from '../../store/settings';
import type { Capture } from '../../store/captures';

export function SemanticSettings({ settings: s, statuses, captures }: { settings: Settings; statuses: Statuses; captures: Capture[] | null }) {
  const [models, setModels] = useState<Embedder[]>([]);
  const [current, setCurrent] = useState<Embedder | null>(null);
  const readySig = EMBED_PROVIDERS.map((p) => statuses[p]?.state ?? '').join(',');
  useEffect(() => {
    let live = true;
    void (async () => {
      const list: Embedder[] = [];
      for (const p of EMBED_PROVIDERS) {
        if (statuses[p]?.state !== 'ready') continue;
        for (const model of await listEmbedModels(p, s.providers[p]).catch(() => [])) list.push({ provider: p, model });
      }
      const cur = await pickEmbedder(s, statuses).catch(() => null);
      if (live) {
        setModels(list);
        setCurrent(cur);
      }
    })();
    return () => {
      live = false;
    };
  }, [readySig, s.semantic.enabled, s.semantic.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = current ? embedderKey(current) : '';
  const done = captures?.filter((c) => c.processing === 'done') ?? [];
  const indexed = key ? done.filter((c) => c.embedding?.model === key).length : 0;
  return (
    <section className="ws-section" aria-labelledby="meaning-h" data-testid="semantic-settings">
      <h2 id="meaning-h">Search by meaning</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Finds captures that mean the same thing in other words. Uses an embedding model on this computer (Ollama or LM Studio) only, so it also works in Private mode. For Ollama: <code>ollama pull nomic-embed-text</code>.
      </p>
      <label className="check">
        <input type="checkbox" checked={s.semantic.enabled} onChange={(e) => void updateSettings((cur) => void (cur.semantic.enabled = e.target.checked))} />
        <span>Search by meaning when a local embedding model is available</span>
      </label>
      {s.semantic.enabled ? (
        models.length ? (
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="embed-model">Embedding model</label>
            <select id="embed-model" className="input" value={s.semantic.model} onChange={(e) => void updateSettings((cur) => void (cur.semantic.model = e.target.value))}>
              <option value="">Automatic{current && !s.semantic.model ? ` (${current.model})` : ''}</option>
              {models.map((m) => (
                <option key={embedderKey(m)} value={embedderKey(m)}>
                  {PROVIDER_INFO[m.provider].name} · {m.model}
                </option>
              ))}
            </select>
            <span className="help" data-testid="semantic-count">
              {current ? `${indexed} of ${done.length} captures indexed with ${current.model}. New captures are added in the background while Eidetic is open.` : 'Choose a model.'}
            </span>
          </div>
        ) : (
          <p className="small">No embedding model found on a connected local provider. Search uses words only.</p>
        )
      ) : null}
    </section>
  );
}
