/** Study: notebooks with progress; review due flashcards, take the quiz, and (on request) AI learning-gap suggestions. */
import { useMemo, useState } from 'react';
import { readyMap, type Statuses } from '../../ai/run';
import type { Settings } from '../../store/settings';
import type { Workspace } from '../../store/workspaces';
import { createNotebook, deleteNotebook, dueCards, gradeCard, progress, saveAttempt, scoreQuiz, weakQuestions, type Grade, type Notebook } from '../../study/notebook';
import { Dialog, Empty } from '../shared/components';
import { previewRoute, routeLine } from '../shared/useActions';
import { AiAnswer, useMultiAi } from './ComparePage';

export function StudyList({ notebooks, workspaces, toast }: { notebooks: Notebook[] | null; workspaces: Workspace[]; toast: (m: string) => void }) {
  const [name, setName] = useState('');
  const [ws, setWs] = useState('');
  return (
    <div className="ws-page">
      <div className="page-head">
        <div className="eyebrow">Study</div>
        <h1 className="page-title">Notebooks</h1>
        <p className="page-intro">Flashcards and quizzes made from your captures. On a capture’s page (or when comparing captures), choose “Make flashcards and quiz” to add to a notebook. Cards come back when they’re due.</p>
      </div>
      {notebooks?.length ? (
        <div className="ws-cards">
          {notebooks.map((nb) => {
            const p = progress(nb);
            return (
              <a key={nb.id} className="ws-card" href={`#/study/${nb.id}`} data-testid="notebook-card">
                <span className="ws-card-name">{nb.name}</span>
                <span className="small muted">
                  {p.cards} card{p.cards === 1 ? '' : 's'} · {p.due} due · {nb.quiz.length} question{nb.quiz.length === 1 ? '' : 's'}
                </span>
                <span className="meta">{p.best === null ? 'No quiz taken yet' : `Best quiz ${p.best}%`}</span>
              </a>
            );
          })}
        </div>
      ) : notebooks ? (
        <Empty title="No notebooks yet">Open a capture and choose “Make flashcards and quiz”, or create an empty notebook here.</Empty>
      ) : null}
      <form
        className="provider-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return toast('Give the notebook a name');
          void createNotebook(name, ws || undefined).then((nb) => {
            toast(`Notebook “${nb.name}” created`);
            setName('');
          });
        }}
      >
        <h2 style={{ fontSize: 15 }}>New notebook</h2>
        <div className="form-row">
          <div className="field">
            <label htmlFor="nb-new-name">Name</label>
            <input id="nb-new-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          {workspaces.length ? (
            <div className="field">
              <label htmlFor="nb-new-ws">Workspace (optional)</label>
              <select id="nb-new-ws" className="input" value={ws} onChange={(e) => setWs(e.target.value)}>
                <option value="">Standalone</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div>
          <button type="submit" className="btn primary">
            Create notebook
          </button>
        </div>
      </form>
    </div>
  );
}

function Review({ nb }: { nb: Notebook }) {
  const due = dueCards(nb);
  const [shown, setShown] = useState(false);
  const card = due[0];
  if (!card)
    return (
      <p className="small" data-testid="review-done">
        {nb.cards.length ? 'Nothing due. Come back later: cards return when they’re due.' : 'No flashcards yet.'}
      </p>
    );
  const grade = (g: Grade) => {
    setShown(false);
    void gradeCard(nb.id, card.id, g);
  };
  return (
    <div className="flashcard" data-testid="flashcard">
      <div className="meta">{due.length} due</div>
      <div className="serif fc-q">{card.q}</div>
      {shown ? (
        <>
          <div className="fc-a" data-testid="fc-answer">
            {card.a}
          </div>
          <div className="row-gap wrap" role="group" aria-label="How well did you know it?">
            <button type="button" className="btn" onClick={() => grade('again')}>
              Again <span className="meta">10 min</span>
            </button>
            <button type="button" className="btn primary" onClick={() => grade('good')}>
              Good
            </button>
            <button type="button" className="btn" onClick={() => grade('easy')}>
              Easy
            </button>
          </div>
        </>
      ) : (
        <div>
          <button type="button" className="btn primary" onClick={() => setShown(true)}>
            Show answer
          </button>
        </div>
      )}
    </div>
  );
}

function Quiz({ nb }: { nb: Notebook }) {
  const [chosen, setChosen] = useState<number[]>(() => nb.quiz.map(() => -1));
  const [result, setResult] = useState<ReturnType<typeof scoreQuiz> | null>(null);
  if (!nb.quiz.length) return <p className="small">No quiz questions yet.</p>;
  return (
    <form
      className="quiz"
      onSubmit={(e) => {
        e.preventDefault();
        const a = scoreQuiz(nb.quiz, chosen);
        setResult(a);
        void saveAttempt(nb.id, a);
      }}
    >
      {nb.quiz.map((q, i) => {
        const wrong = result?.wrong.includes(q.id);
        return (
          <fieldset key={q.id} className={`quiz-q${result ? (wrong ? ' wrong' : ' right') : ''}`}>
            <legend>
              {i + 1}. {q.q}
            </legend>
            {q.options.map((o, j) => (
              <label key={j} className="check">
                <input type="radio" name={`q-${q.id}`} checked={chosen[i] === j} disabled={Boolean(result)} onChange={() => setChosen((cur) => cur.map((v, k) => (k === i ? j : v)))} />
                <span>
                  {o}
                  {result && j === q.answer ? <strong> ✓</strong> : null}
                </span>
              </label>
            ))}
            {result && wrong && q.explain ? <div className="small muted">{q.explain}</div> : null}
          </fieldset>
        );
      })}
      {result ? (
        <div className="row-gap wrap">
          <strong data-testid="quiz-score">
            {result.score} of {result.total} right
          </strong>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setResult(null);
              setChosen(nb.quiz.map(() => -1));
            }}
          >
            Take it again
          </button>
        </div>
      ) : (
        <div>
          <button type="submit" className="btn primary">
            Check answers
          </button>
        </div>
      )}
    </form>
  );
}

export function StudyDetail({ id, notebooks, settings, statuses, toast }: { id: string; notebooks: Notebook[] | null; settings: Settings; statuses: Statuses; toast: (m: string) => void }) {
  const nb = notebooks?.find((n) => n.id === id);
  const [tab, setTab] = useState<'review' | 'quiz' | 'progress'>('review');
  const [confirm, setConfirm] = useState(false);
  const { state, run, stop } = useMultiAi([], settings, statuses);
  const weak = useMemo(() => (nb ? weakQuestions(nb) : []), [nb]);
  if (!notebooks) return null;
  if (!nb) return <p>This notebook no longer exists.</p>;
  const p = progress(nb);
  const aiReady = Object.keys(readyMap(statuses)).length > 0;
  const r = previewRoute('learning-gaps', settings, statuses, false);
  const gaps = () =>
    void run('learning-gaps', [
      {
        category: 'Quiz mistakes',
        description: `Notebook “${nb.name}”`,
        text: weak.map((q) => `Question: ${q.q}\nCorrect answer: ${q.options[q.answer]}`).join('\n\n') + `\n\nFlashcard topics: ${nb.cards.slice(0, 30).map((c) => c.q).join(' | ')}`,
      },
    ]);
  return (
    <div className="ws-page narrow">
      <a href="#/study" className="small">
        ‹ Notebooks
      </a>
      <div className="page-head">
        <div className="eyebrow">Notebook</div>
        <h1 className="page-title">{nb.name}</h1>
        <div className="meta">
          {p.cards} cards · {p.due} due · {p.mastered} mastered · {nb.quiz.length} quiz questions
        </div>
      </div>
      <div className="chips" role="tablist" aria-label="Study">
        {(
          [
            ['review', `Review (${p.due})`],
            ['quiz', 'Quiz'],
            ['progress', 'Progress'],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" role="tab" className="chip" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'review' ? <Review nb={nb} /> : null}
      {tab === 'quiz' ? <Quiz key={nb.quiz.length} nb={nb} /> : null}
      {tab === 'progress' ? (
        <section className="ws-section" data-testid="progress">
          <dl className="kv">
            <dt>Flashcards</dt>
            <dd>
              {p.cards} ({p.due} due now, {p.learning} learning, {p.mastered} mastered)
            </dd>
            <dt>Quizzes taken</dt>
            <dd>{p.quizzes}</dd>
            <dt>Best score</dt>
            <dd>{p.best === null ? '—' : `${p.best}%`}</dd>
            <dt>Last score</dt>
            <dd>{p.last === null ? '—' : `${p.last}%`}</dd>
          </dl>
          <h2>Learning gaps</h2>
          {weak.length ? (
            <>
              <ul className="plain small">
                {weak.map((q) => (
                  <li key={q.id}>{q.q}</li>
                ))}
              </ul>
              <div>
                <button type="button" className="btn" disabled={!aiReady || Boolean(state?.streaming)} onClick={gaps}>
                  Suggest what to study next (AI)
                </button>
              </div>
              <div className="small muted">{!aiReady ? 'Needs an AI model.' : r ? `${routeLine(r)} Only these questions and card titles are sent.` : 'No model is ready.'}</div>
              {state ? <div className="small accent-text">Suggested by AI, based on your wrong answers. Check it against your course material.</div> : null}
              <AiAnswer state={state} stop={stop} />
            </>
          ) : (
            <p className="small muted">Questions you answer wrongly in a quiz appear here.</p>
          )}
        </section>
      ) : null}
      <div>
        <button type="button" className="btn small ghost danger" onClick={() => setConfirm(true)}>
          Delete notebook…
        </button>
      </div>
      {confirm ? (
        <Dialog
          title={`Delete “${nb.name}”?`}
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void deleteNotebook(nb.id).then(() => {
                    toast('Notebook deleted');
                    location.hash = '/study';
                  })
                }
              >
                Delete
              </button>
            </>
          }
        >
          <p className="small">Its flashcards, quiz and progress are removed. Captures are not affected.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
