/** Search by meaning in the UI: keeps vectors up to date in the background and embeds the query when asked. */
import { useEffect, useState } from 'react';
import { embedderKey, embedTexts, pickEmbedder } from '../../ai/embed';
import type { Statuses } from '../../ai/run';
import { backfillEmbeddings } from '../../search/backfill';
import { backfillHashes } from '../../store/hashes';
import { rankByMeaning, type MeaningMatch } from '../../search/semantic';
import type { Capture } from '../../store/captures';
import type { Settings } from '../../store/settings';

/** While a page is open, captures without a vector get one, a few at a time, shortly after they change. */
export function useEmbeddingBackfill(settings: Settings | null, statuses: Statuses, captures: Capture[] | null): void {
  const ready = Boolean(settings?.semantic.enabled) && (statuses.ollama?.state === 'ready' || statuses.lmstudio?.state === 'ready');
  const sig = captures ? captures.map((c) => `${c.id}${c.processing}${c.embedding?.model ?? ''}`).join('|') : '';
  // Captures saved before v3 get their perceptual hash (duplicates, cleanup) once, in the background.
  const missingHash = captures?.some((c) => !c.hash && c.processing === 'done' && !c.needsCrop) ?? false;
  useEffect(() => {
    if (!missingHash) return;
    const t = setTimeout(() => void backfillHashes().catch(() => undefined), 2000);
    return () => clearTimeout(t);
  }, [missingHash]);
  useEffect(() => {
    if (!ready || !settings || !sig) return;
    const t = setTimeout(() => void backfillEmbeddings(settings, statuses).catch(() => undefined), 1200);
    return () => clearTimeout(t);
  }, [ready, sig]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useMeaningSearch(captures: Capture[] | null, query: string, settings: Settings | null, statuses: Statuses, exclude: string[]): { matches: Array<MeaningMatch<Capture>>; model: string | null; busy: boolean } {
  const [state, setState] = useState<{ matches: Array<MeaningMatch<Capture>>; model: string | null; busy: boolean }>({ matches: [], model: null, busy: false });
  const q = query.trim();
  const ex = exclude.join(',');
  useEffect(() => {
    if (!settings || !captures || q.length < 3) {
      setState({ matches: [], model: null, busy: false });
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      void (async () => {
        const e = await pickEmbedder(settings, statuses);
        if (!e || !live) return setState({ matches: [], model: null, busy: false });
        setState((cur) => ({ ...cur, busy: true }));
        try {
          const [v] = await embedTexts(e, settings.providers[e.provider], [q]);
          if (live) setState({ matches: rankByMeaning(captures, v!, embedderKey(e), ex ? ex.split(',') : []), model: e.model, busy: false });
        } catch {
          if (live) setState({ matches: [], model: e.model, busy: false });
        }
      })();
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, captures, settings, statuses, ex]);
  return state;
}
