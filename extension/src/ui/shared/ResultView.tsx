/**
 * One capture: the image with its crop marks, what it is, the best action first, AI answers that stream in,
 * follow-up questions, privacy review, the recognised text and notes. Used by the side panel and the workspace.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { actionsFor, type ActionDef } from '../../actions/registry';
import { readingLanguages, refineLocally, processCapture, rereadCapture } from '../../capture/pipeline';
import { formatTime } from '../../capture/capture';
import { readyMap, type Statuses } from '../../ai/run';
import { PRIVACY_LABEL, PRIVACY_NOUN } from '../../privacy/detect';
import { deleteCaptures, formatNumber, updateCapture, type Capture } from '../../store/captures';
import { OCR_LANGUAGES, type Settings } from '../../store/settings';
import { IconAlert, IconCheck, IconChevron, IconCopy, IconExternal, IconFix, IconInfo, IconLock, IconPlay, IconSend, IconShield, IconTrash } from '../design/icons';
import { Markdown } from './markdown';
import { CropMarks, Dialog, Menu } from './components';
import { CropPicker } from './CropPicker';
import { HideAreas } from './HideAreas';
import { timeAgo, useImageUrl } from './hooks';
import { previewRoute, routeLine, useActions } from './useActions';

const workspaceUrl = (hash: string) => chrome.runtime.getURL(`workspace.html#${hash}`);

export function ResultView({ capture, settings, statuses, toast, wide = false, onDeleted }: { capture: Capture; settings: Settings; statuses: Statuses; toast: (m: string) => void; wide?: boolean; onDeleted?: () => void }) {
  const c = capture;
  const imgUrl = useImageUrl(c.image.blobId, c.image.bytes);
  const { answer, run, followUp, stop, safeImage } = useActions(c, settings, statuses, toast);
  const aiReady = Object.keys(readyMap(statuses)).length > 0;
  const [question, setQuestion] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showHide, setShowHide] = useState(false);
  const [note, setNote] = useState(c.notes);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const findings = c.privacy?.findings ?? [];
  const [chosen, setChosen] = useState<boolean[]>([]);

  useEffect(() => setNote(c.notes), [c.id, c.notes]);
  useEffect(() => setChosen(findings.map(() => true)), [c.id, findings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Process new captures (reading text happens in the panel or workspace, never in the background).
  useEffect(() => {
    if (c.processing === 'new' && !c.needsCrop) void processCapture(c.id, settings).then((done) => {
        if (done?.processing === 'done') void refineLocally(c.id, settings, statuses);
      });
  }, [c.id, c.processing, c.needsCrop]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo(() => (c.detection ? actionsFor(c.detection, aiReady, { hasPrivacyFindings: findings.length > 0 }) : null), [c.detection, aiReady, findings.length]);

  const primaryRoute = actions?.primary.ai ? previewRoute(actions.primary.ai, settings, statuses, true) : null;
  const daysLeft = settings.tempDays ? Math.max(0, Math.ceil((c.createdAt + settings.tempDays * 86_400_000 - Date.now()) / 86_400_000)) : null;

  const doAction = (a: ActionDef) => {
    if (a.kind === 'ai' && !aiReady) {
      void chrome.tabs.create({ url: workspaceUrl('/settings/ai') });
      return;
    }
    if (a.ai === 'ask') {
      document.getElementById(`ask-${c.id}`)?.focus();
      return;
    }
    void run(a).then(() => {
      if (a.kind === 'ai') answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const aiTag = (a: ActionDef) => {
    if (a.kind !== 'ai') return null;
    if (!aiReady) return <span className="needs">Connect AI</span>;
    const r = a.ai ? previewRoute(a.ai, settings, statuses, true) : null;
    return r ? <span className="needs">{r.local ? 'local' : 'cloud'}</span> : null;
  };

  return (
    <div className={`result${wide ? ' wide' : ''}`}>
      <figure className="result-figure">
        {c.needsCrop ? (
          <CropPicker capture={c} imgUrl={imgUrl} onDone={() => void processCapture(c.id, settings)} />
        ) : (
          <CropMarks className="result-image">{imgUrl ? <img src={imgUrl} alt={c.detection ? `Capture: ${c.detection.description}` : 'Capture'} /> : <div className="img-placeholder" />}</CropMarks>
        )}
        <figcaption className="meta result-caption">
          <span>
            {c.source.site || 'Image'} · {timeAgo(c.createdAt)} · {c.image.w} × {c.image.h}
          </span>
          <span>{c.status === 'kept' || c.pinned ? 'Kept' : 'Temporary'}</span>
        </figcaption>
        {!c.needsCrop && !showHide ? (
          <button type="button" className="linkish small hide-open" data-testid="hide-open" onClick={() => setShowHide(true)}>
            <IconShield size={13} /> Hide part of the image…
          </button>
        ) : null}
        {c.video ? (
          <div className="video-line" data-testid="video-line">
            <IconPlay size={12} />
            <span>
              Video at <strong>{formatTime(c.video.time)}</strong>
              {c.video.duration ? <span className="muted"> of {formatTime(c.video.duration)}</span> : null}
            </span>
            {c.video.resumeUrl ? (
              <a href={c.video.resumeUrl} target="_blank" rel="noreferrer">
                Resume at {formatTime(c.video.time)} ›
              </a>
            ) : c.video.url ? (
              <a href={c.video.url} target="_blank" rel="noreferrer" title="This site doesn’t support links to a moment, so the page opens">
                Open the video page ›
              </a>
            ) : null}
          </div>
        ) : null}
      </figure>

      {showHide ? (
        <HideAreas
          imgUrl={imgUrl}
          width={c.image.w}
          height={c.image.h}
          detected={findings.filter((_, i) => chosen[i]).flatMap((f) => f.boxes)}
          onDownload={(exact, style) => safeImage(findings.filter((_, i) => chosen[i]).flatMap((f) => f.boxes), style, exact)}
          onClose={() => setShowHide(false)}
        />
      ) : null}

      {c.processing === 'reading' || (c.processing === 'new' && !c.needsCrop) ? (
        <div className="note" role="status">
          <span className="spinner" />
          <span>Reading the text on this computer…</span>
        </div>
      ) : null}
      {c.processing === 'error' ? (
        <div className="note err" role="alert">
          <IconAlert size={16} />
          <span>
            {c.error}{' '}
            <button type="button" className="btn small" onClick={() => void updateCapture(c.id, (x) => void (x.processing = 'new'))}>
              Try again
            </button>
          </span>
        </div>
      ) : null}

      {c.detection ? (
        <section className="result-what" aria-label="What this is">
          <div className="eyebrow" data-testid="result-label">{c.detection.label}</div>
          <h1 className="serif result-title" data-testid="result-title">{c.ai.description ?? c.detection.description}</h1>
          <div className="small muted result-by" data-testid="result-by">
            {c.ai.description ? (
              <>
                <IconInfo size={14} /> Described by {c.ai.model} on this computer. Recognised as: {c.detection.description}
              </>
            ) : (
              <>
                <IconCheck size={14} /> Recognised on this computer, no AI used
              </>
            )}
          </div>
        </section>
      ) : null}

      {actions ? (
        <section className="result-actions" aria-label="Actions">
          <button type="button" className="btn primary large" data-testid="primary-action" onClick={() => doAction(actions.primary)}>
            <span className="row-gap">
              {actions.primary.kind === 'ai' ? <IconFix size={18} /> : <IconCopy size={18} />}
              {actions.primary.label}
            </span>
            {actions.primary.kind === 'ai' && primaryRoute ? <span className="tag">{primaryRoute.local ? 'local' : 'cloud'}</span> : null}
          </button>
          <div className="btn-row">
            {actions.secondary.slice(0, 2).map((a) => (
              <button key={a.id} type="button" className="btn" onClick={() => doAction(a)} title={a.kind === 'ai' && !aiReady ? 'Needs an AI model: opens AI settings' : undefined}>
                {a.label}
              </button>
            ))}
            <Menu
              trigger={(p) => (
                <button type="button" className="btn ghost" {...p}>
                  More <IconChevron size={14} />
                </button>
              )}
            >
              {(close) => (
                <>
                  {[...actions.secondary.slice(2), ...actions.more].map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        doAction(a);
                      }}
                    >
                      <span>{a.label}</span>
                      {aiTag(a)}
                    </button>
                  ))}
                </>
              )}
            </Menu>
          </div>
          <div className="small muted" data-testid="route-line">
            {actions.primary.kind === 'ai'
              ? primaryRoute
                ? routeLine(primaryRoute)
                : 'Needs an AI model. Connect one in Settings › AI models; everything else works without it.'
              : actions.demoted
                ? 'AI actions are available after you connect a model in Settings › AI models.'
                : 'Runs on this computer.'}
          </div>
        </section>
      ) : null}

      {findings.length ? (
        <section className="note warn privacy" aria-label="Privacy" data-testid="privacy">
          <IconShield size={16} />
          <div className="grow">
            <div>
              {findings.length} private detail{findings.length === 1 ? '' : 's'} found: {[...new Set(findings.map((f) => PRIVACY_NOUN[f.kind]))].join(', ')}.{' '}
              <button type="button" className="linkish" onClick={() => setShowPrivacy((v) => !v)} aria-expanded={showPrivacy}>
                {showPrivacy ? 'Hide' : 'Review'}
              </button>
            </div>
            {showPrivacy ? (
              <div className="privacy-list">
                {findings.map((f, i) => (
                  <label key={`${f.kind}-${f.value}`} className="check">
                    <input type="checkbox" checked={chosen[i] ?? true} onChange={(e) => setChosen((cur) => cur.map((v, j) => (j === i ? e.target.checked : v)))} />
                    <span>
                      <span className="mono small">{PRIVACY_LABEL[f.kind]}</span> · <span className="mono">{f.value.length > 6 ? `${f.value.slice(0, 3)}…${f.value.slice(-2)}` : '•••'}</span>
                      {!f.boxes.length ? <span className="muted small"> (not located in the image)</span> : null}
                    </span>
                  </label>
                ))}
                <div className="row-gap wrap">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => void safeImage(findings.filter((_, i) => chosen[i]).flatMap((f) => f.boxes))}
                    disabled={!findings.some((f, i) => chosen[i] && f.boxes.length)}
                  >
                    Download safe image
                  </button>
                  <button type="button" className="btn small" onClick={() => doAction({ id: 'safe-copy', label: 'Copy without private details', kind: 'local', local: 'safe-copy' })}>
                    Copy safe text
                  </button>
                </div>
                <div className="small muted">
                  The original capture stays unchanged on this computer. Something missed?{' '}
                  <button type="button" className="linkish" onClick={() => setShowHide(true)}>
                    Hide more of the image
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {answer ? (
        <section className="answer" aria-label="Answer" ref={answerRef} aria-busy={answer.streaming} data-testid="answer">
          <div className="answer-head">
            <h2 className="h-section">{answer.label}</h2>
            {answer.route ? (
              <span className="meta" title={answer.route.reason}>
                {answer.route.model} · {answer.route.local ? 'local' : 'cloud'}
              </span>
            ) : null}
          </div>
          {answer.route && !answer.route.local && answer.streaming ? (
            <div className="small muted row-gap">
              <IconExternal size={13} /> {routeLine(answer.route)}
            </div>
          ) : null}
          {answer.turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="turn-q">
                {t.text}
              </div>
            ) : (
              <Markdown key={i} text={t.text} />
            ),
          )}
          {answer.streaming || answer.error ? (
            <>
              {answer.pendingQuestion ? <div className="turn-q">{answer.pendingQuestion}</div> : null}
              {answer.streaming && !answer.text ? (
                <div className="row-gap small muted" role="status">
                  <span className="spinner" /> {answer.route ? `Asking ${answer.route.model}…` : 'Choosing a model…'}
                </div>
              ) : null}
              {answer.text ? <Markdown text={answer.text} streaming={answer.streaming} /> : null}
            </>
          ) : null}
          {answer.error ? (
            <div className="note err" role="alert">
              <IconAlert size={16} />
              <div>
                <div>{answer.error.message}</div>
                {answer.error.hint ? <div className="hint">{answer.error.hint}</div> : null}
              </div>
            </div>
          ) : null}
          {answer.streaming ? (
            <button type="button" className="btn small" onClick={stop}>
              Stop
            </button>
          ) : null}
          {answer.route && !answer.streaming ? (
            <details className="why small muted">
              <summary>Why this model?</summary>
              {answer.route.reason}.
            </details>
          ) : null}
        </section>
      ) : null}

      {c.detection ? (
        <form
          className="input-group ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (!aiReady) {
              void chrome.tabs.create({ url: workspaceUrl('/settings/ai') });
              return;
            }
            void followUp(question);
            setQuestion('');
          }}
        >
          <label className="sr-only" htmlFor={`ask-${c.id}`}>
            {answer && answer.turns.length ? 'Ask a follow-up' : 'Ask about this capture'}
          </label>
          <input id={`ask-${c.id}`} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={aiReady ? (answer && answer.turns.length ? 'Ask a follow-up…' : 'Ask about this capture…') : 'Connect AI to ask questions'} />
          <button type="submit" className="btn icon small soft" aria-label="Send" disabled={aiReady && !question.trim()}>
            <IconSend size={16} />
          </button>
        </form>
      ) : null}

      {c.answers.length && !answer ? (
        <details className="saved">
          <summary className="h-section">Saved answers ({c.answers.length})</summary>
          {[...c.answers].reverse().map((a) => (
            <div key={a.at} className="saved-answer">
              <div className="answer-head">
                <span className="small">{a.label}</span>
                <span className="meta">
                  {a.model} · {a.local ? 'local' : 'cloud'} · {timeAgo(a.at)}
                </span>
              </div>
              <Markdown text={a.text} />
            </div>
          ))}
        </details>
      ) : null}

      {c.ocr ? (
        <section className="textblock">
          <div className="answer-head">
            <button type="button" className="linkish h-section" data-testid="text-toggle" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
              Text ({c.ocr.text.split('\n').filter(Boolean).length} lines) {showText ? '▴' : '▾'}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() =>
                void navigator.clipboard.writeText(c.ocr!.text).then(
                  () => toast('Text copied'),
                  () => toast('Couldn’t copy'),
                )
              }
            >
              <IconCopy size={14} /> Copy
            </button>
          </div>
          {showText ? <pre className="ocr-text" data-testid="ocr-text">{c.ocr.text || '(No text recognised)'}</pre> : null}
          <div className="field reread" data-testid="reread">
            <label htmlFor={`reread-${c.id}`} className="help">
              Read in {c.ocr.langs.map((l) => OCR_LANGUAGES[l] ?? l).join(' + ')}. Wrong language? Read it again in:
            </label>
            <select
              id={`reread-${c.id}`}
              className="input"
              value=""
              disabled={c.processing !== 'done'}
              onChange={(e) => {
                const code = e.target.value;
                if (!code) return;
                void rereadCapture(c.id, code).then(() => toast(`Reading again in ${readingLanguages(code).map((l) => OCR_LANGUAGES[l]).join(' + ')}…`));
              }}
            >
              <option value="">Choose a language…</option>
              {Object.entries(OCR_LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code === 'eng' ? name : `${name} + English`}
                </option>
              ))}
            </select>
            <span className="help">Languages other than English download once (a few MB), then work offline. The text never leaves this computer.</span>
          </div>
        </section>
      ) : null}

      <section className="notes">
        <label htmlFor={`note-${c.id}`} className="h-section">
          Note
        </label>
        <textarea
          id={`note-${c.id}`}
          ref={noteRef}
          className="input"
          value={note}
          placeholder="Add a note to find this later"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== c.notes && void updateCapture(c.id, (x) => void (x.notes = note.slice(0, 4000)))}
        />
      </section>

      <div className="result-foot">
        <span className="small muted">
          {formatNumber(c.number)} · {c.status === 'kept' || c.pinned ? 'Kept: never removed automatically' : daysLeft === null ? 'Temporary' : `Temporary · removed in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
        </span>
        <span className="row-gap">
          <button type="button" className="btn small" aria-pressed={c.pinned} onClick={() => void updateCapture(c.id, (x) => void (x.pinned = !x.pinned))}>
            {c.pinned ? 'Unpin' : 'Pin'}
          </button>
          {c.status !== 'kept' ? (
            <button type="button" className="btn small soft" onClick={() => void updateCapture(c.id, (x) => void (x.status = 'kept')).then(() => toast('Kept'))}>
              Keep
            </button>
          ) : null}
          <button type="button" className="btn small ghost danger" aria-label="Delete capture" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={16} />
          </button>
        </span>
      </div>

      {settings.mode === 'private' ? (
        <div className="small muted row-gap">
          <IconLock size={14} /> Private mode: AI runs only on this computer.
        </div>
      ) : null}

      {confirmDelete ? (
        <Dialog
          title="Delete this capture?"
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void deleteCaptures([c.id]).then(() => {
                    setConfirmDelete(false);
                    toast('Capture deleted');
                    onDeleted?.();
                  })
                }
              >
                Delete
              </button>
            </>
          }
        >
          <p className="small">The image, its text, notes and saved answers are removed from this computer. This can’t be undone.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
