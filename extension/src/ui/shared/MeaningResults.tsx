/** "Similar in meaning": results from a local embedding model, after the word results. */
import type { Statuses } from '../../ai/run';
import type { Capture } from '../../store/captures';
import type { Settings } from '../../store/settings';
import { CaptureRow } from './components';
import { useMeaningSearch } from './useMeaning';

export function MeaningResults({ captures, query, settings, statuses, exclude, onOpen }: { captures: Capture[] | null; query: string; settings: Settings; statuses: Statuses; exclude: string[]; onOpen: (id: string) => void }) {
  const { matches, model, busy } = useMeaningSearch(captures, query, settings, statuses, exclude);
  if (!model || (!matches.length && !busy)) return null;
  return (
    <section className="meaning" aria-label="Similar in meaning" data-testid="meaning">
      <div className="meta lib-count">
        <span>Similar in meaning</span>
        <span>{busy ? 'Searching…' : `${model} · on this computer`}</span>
      </div>
      {matches.map((m) => (
        <CaptureRow key={m.capture.id} capture={m.capture} onOpen={() => onOpen(m.capture.id)} extra={<div className="small muted reason">{Math.round(m.similarity * 100)}% similar in meaning</div>} />
      ))}
    </section>
  );
}
