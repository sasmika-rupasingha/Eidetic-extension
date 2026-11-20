/** Generates flashcards and a quiz from one capture or a selection (AI, JSON, validated) and saves them in a notebook. */
import { useState } from 'react';
import type { PromptContext } from '../../ai/prompts';
import { describeError, readyMap, runAi, type Statuses } from '../../ai/run';
import { CATEGORY_LABEL } from '../../detect/classify';
import type { Capture } from '../../store/captures';
import type { Settings } from '../../store/settings';
import { addStudySet, createNotebook, parseStudySet } from '../../study/notebook';
import { useNotebooks } from './hooks';
import { previewRoute, routeLine } from './useActions';

const NEW = '__new__';

function contextOf(caps: Capture[]): PromptContext {
  const one = (c: Capture) => ({ text: c.ocr?.text ?? '', category: c.detection ? CATEGORY_LABEL[c.detection.category] : 'Capture', description: c.ai.description ?? c.detection?.description ?? '', source: c.source.site });
  if (caps.length === 1) return one(caps[0]!);
  return { text: '', category: 'Several captures', description: '', items: caps.map(one) };
}

export function StudyMaker({ captures, settings, statuses, toast, workspaceId }: { captures: Capture[]; settings: Settings; statuses: Statuses; toast: (m: string) => void; workspaceId?: string }) {
  const notebooks = useNotebooks();
  const [choice, setChoice] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const aiReady = Object.keys(readyMap(statuses)).length > 0;
  const r = previewRoute('study-set', settings, statuses, false);
  const target = choice || (notebooks?.length ? notebooks[0]!.id : NEW);
  const go = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const run = await runAi('study-set', contextOf(captures), settings, statuses);
      const set = parseStudySet(run.text);
      if (!set) throw new Error(`${run.route.model}’s answer couldn’t be read as flashcards. Try again, or choose another model.`);
      const nb = target === NEW ? await createNotebook(name.trim() || captures[0]?.ai.topics?.[0] || 'My notebook', workspaceId) : { id: target };
      const after = await addStudySet(nb.id, set, captures.length === 1 ? captures[0]!.id : undefined);
      const text = `Saved ${set.flashcards.length} flashcard${set.flashcards.length === 1 ? '' : 's'} and ${set.quiz.length} quiz question${set.quiz.length === 1 ? '' : 's'} to “${after?.name ?? 'notebook'}”.`;
      setSaved({ id: nb.id, text });
      toast(text);
    } catch (e) {
      setError(describeError(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="study-maker" data-testid="study-maker">
      <div className="row-gap wrap" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor={`nb-${captures[0]?.id ?? 'x'}`}>Notebook</label>
          <select id={`nb-${captures[0]?.id ?? 'x'}`} className="input" value={target} onChange={(e) => setChoice(e.target.value)}>
            {(notebooks ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
            <option value={NEW}>New notebook…</option>
          </select>
        </div>
        {target === NEW ? (
          <div className="field">
            <label htmlFor={`nb-name-${captures[0]?.id ?? 'x'}`}>Name</label>
            <input id={`nb-name-${captures[0]?.id ?? 'x'}`} className="input" value={name} maxLength={80} placeholder={captures[0]?.ai.topics?.[0] ?? 'My notebook'} onChange={(e) => setName(e.target.value)} />
          </div>
        ) : null}
        <button type="button" className="btn" disabled={!aiReady || busy} onClick={() => void go()}>
          {busy ? 'Making…' : 'Make flashcards and quiz'}
        </button>
      </div>
      <div className="small muted">{!aiReady ? 'Needs an AI model (Settings › AI models).' : r ? routeLine(r) : 'No model is ready for this.'}</div>
      {busy ? (
        <div className="row-gap small muted" role="status">
          <span className="spinner" /> Writing flashcards and questions…
        </div>
      ) : null}
      {error ? (
        <div className="note err" role="alert">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="note ok" role="status" data-testid="study-saved">
          <span>
            {saved.text}{' '}
            <a href={chrome.runtime.getURL(`workspace.html#/study/${saved.id}`)} target="_blank" rel="noreferrer">
              Study now ›
            </a>
          </span>
        </div>
      ) : null}
    </div>
  );
}
