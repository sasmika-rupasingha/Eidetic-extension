/** First run: three short steps. Shown once, dismissible at any point. */
import { IconClose } from '../design/icons';

export function Onboarding({ aiReady, onDone, onAi }: { aiReady: boolean; onDone: () => void; onAi: () => void }) {
  return (
    <section className="onboard" aria-label="Getting started">
      <div className="section-head">
        <h2 className="serif onboard-title">Welcome to Eidetic</h2>
        <button type="button" className="btn ghost icon small" aria-label="Close getting started" onClick={onDone}>
          <IconClose size={15} />
        </button>
      </div>
      <ol className="steps">
        <li>
          <strong>Pin it.</strong> Puzzle-piece icon in the toolbar › pin Eidetic, so it’s one click away.
        </li>
        <li>
          <strong>Capture something.</strong> Press <span className="kbd">Alt</span> <span className="kbd">Shift</span> <span className="kbd">E</span> on any page and drag over a slide, an error or a table.
        </li>
        <li>
          <strong>AI is optional.</strong> {aiReady ? 'A model is already connected.' : 'Text, tables, links and search work offline. For explanations, connect a model.'}{' '}
          {!aiReady ? (
            <button type="button" className="linkish" onClick={onAi}>
              Connect AI ›
            </button>
          ) : null}
        </li>
      </ol>
      <button type="button" className="btn small" onClick={onDone}>
        Got it
      </button>
    </section>
  );
}
