/** Ask: a conversation about one capture (the latest by default). Answers are saved with the capture. */
import { useEffect, useState } from 'react';
import { readyMap, type Statuses } from '../../ai/run';
import type { Capture } from '../../store/captures';
import type { Settings } from '../../store/settings';
import { IconAlert, IconSend } from '../design/icons';
import { Empty, Thumb, titleOf } from '../shared/components';
import { Markdown } from '../shared/markdown';
import { routeLine, useActions } from '../shared/useActions';

export function AskView({ captures, settings, statuses, toast, onOpen }: { captures: Capture[] | null; settings: Settings; statuses: Statuses; toast: (m: string) => void; onOpen: (id: string) => void }) {
  const ready = (captures ?? []).filter((c) => c.processing === 'done');
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!id && ready[0]) setId(ready[0].id);
  }, [id, ready]);
  const cap = ready.find((c) => c.id === id) ?? null;
  const aiReady = Object.keys(readyMap(statuses)).length > 0;

  if (!captures) return null;
  if (!ready.length) return <Empty title="Nothing to ask about yet">Capture something first. Then ask questions about it here, like “what does this mean?” or “turn this into notes”.</Empty>;

  return (
    <div className="ask-view">
      <label className="field">
        <span className="label">About</span>
        <select className="input" value={id ?? ''} onChange={(e) => setId(e.target.value)}>
          {ready.slice(0, 30).map((c) => (
            <option key={c.id} value={c.id}>
              {titleOf(c).slice(0, 80)}
            </option>
          ))}
        </select>
      </label>
      {cap ? (
        <button type="button" className="ask-context" onClick={() => onOpen(cap.id)}>
          <Thumb capture={cap} size={56} />
          <span className="small muted">{cap.detection?.label} · open the capture ›</span>
        </button>
      ) : null}

      {cap ? <AskChat key={cap.id} cap={cap} settings={settings} statuses={statuses} toast={toast} aiReady={aiReady} /> : null}
    </div>
  );
}

function AskChat({ cap, settings, statuses, toast, aiReady }: { cap: Capture; settings: Settings; statuses: Statuses; toast: (m: string) => void; aiReady: boolean }) {
  const { answer, followUp, stop } = useActions(cap, settings, statuses, toast);
  const [q, setQ] = useState('');
  return (
    <>
      {!aiReady ? (
        <div className="note">
          <IconAlert size={16} />
          <span>Asking needs an AI model. Connect Ollama, LM Studio, Chrome built-in AI or your own key in Settings › AI models.</span>
        </div>
      ) : null}

      {answer ? (
        <section className="answer" aria-busy={answer.streaming}>
          {answer.turns.map((t, i) => (t.role === 'user' ? <div key={i} className="turn-q">{t.text}</div> : <Markdown key={i} text={t.text} />))}
          {answer.pendingQuestion && answer.streaming ? <div className="turn-q">{answer.pendingQuestion}</div> : null}
          {answer.streaming && !answer.text ? (
            <div className="row-gap small muted">
              <span className="spinner" /> Thinking…
            </div>
          ) : null}
          {answer.streaming && answer.text ? <Markdown text={answer.text} streaming /> : null}
          {answer.error ? (
            <div className="note err" role="alert">
              <IconAlert size={16} />
              <div>
                {answer.error.message}
                {answer.error.hint ? <div className="hint">{answer.error.hint}</div> : null}
              </div>
            </div>
          ) : null}
          {answer.route ? <div className="small muted">{routeLine(answer.route)}</div> : null}
          {answer.streaming ? (
            <button type="button" className="btn small" onClick={stop}>
              Stop
            </button>
          ) : null}
        </section>
      ) : (
        <div className="suggestions">
          {['What does this mean?', 'Turn this into short notes', 'What should I do next?'].map((s) => (
            <button key={s} type="button" className="chip" disabled={!aiReady} onClick={() => void followUp(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="input-group"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          void followUp(q);
          setQ('');
        }}
      >
        <label htmlFor="ask-q" className="sr-only">
          Your question
        </label>
        <input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this capture…" disabled={!aiReady} />
        <button type="submit" className="btn icon small soft" aria-label="Send" disabled={!aiReady || !q.trim()}>
          <IconSend size={16} />
        </button>
      </form>
    </>
  );
}
