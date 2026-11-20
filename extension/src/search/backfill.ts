/**
 * Computes meaning vectors for captures in small batches while the panel or workspace is open. Only a local model is
 * used (see ai/embed.ts). One run at a time per page; it stops quietly if the model goes away.
 */
import { embedderKey, embedTexts, embedText, pickEmbedder } from '../ai/embed';
import type { Statuses } from '../ai/run';
import { linkRelated } from '../memory/link';
import { listCaptures, updateCapture } from '../store/captures';
import type { Settings } from '../store/settings';
import { needsEmbedding } from './semantic';

let running: Promise<number> | null = null;

export function backfillEmbeddings(s: Settings, statuses: Statuses, batch = 8, maxBatches = 25): Promise<number> {
  if (running) return running;
  running = (async () => {
    const e = await pickEmbedder(s, statuses);
    if (!e) return 0;
    const key = embedderKey(e);
    const todo = needsEmbedding(await listCaptures(), key).slice(0, batch * maxBatches);
    let done = 0;
    for (let i = 0; i < todo.length; i += batch) {
      const part = todo.slice(i, i + batch);
      let vectors: number[][];
      try {
        vectors = await embedTexts(e, s.providers[e.provider], part.map(embedText));
      } catch {
        break;
      }
      for (let j = 0; j < part.length; j++) {
        await updateCapture(part[j]!.id, (c) => void (c.embedding = { model: key, vector: vectors[j]!, at: Date.now() }));
        await linkRelated(part[j]!.id).catch(() => undefined);
        done += 1;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
