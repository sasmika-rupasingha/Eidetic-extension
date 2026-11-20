/** Search by meaning: vectors from a local embedding model, compared with cosine similarity. */

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface MeaningMatch<C> {
  capture: C;
  similarity: number;
}

/** Below this, a match by meaning is noise. */
export const MIN_SIMILARITY = 0.5;

/**
 * Captures ranked by similarity to the query vector, only those embedded by the same model, without the ones the word
 * search already found (word results stay first).
 */
export function rankByMeaning<C extends { id: string; embedding?: { model: string; vector: number[] } }>(captures: C[], query: number[], model: string, exclude: Iterable<string> = [], max = 10, min = MIN_SIMILARITY): Array<MeaningMatch<C>> {
  const skip = new Set(exclude);
  const out: Array<MeaningMatch<C>> = [];
  for (const c of captures) {
    if (skip.has(c.id) || !c.embedding || c.embedding.model !== model) continue;
    const s = cosine(query, c.embedding.vector);
    if (s >= min) out.push({ capture: c, similarity: s });
  }
  return out.sort((a, b) => b.similarity - a.similarity).slice(0, max);
}

/** Captures that need a (new) vector from this model. */
export function needsEmbedding<C extends { processing: string; embedding?: { model: string } }>(captures: C[], model: string): C[] {
  return captures.filter((c) => c.processing === 'done' && c.embedding?.model !== model);
}
