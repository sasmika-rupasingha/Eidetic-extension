/**
 * Embeddings for search by meaning, from a model on this computer only: Ollama (/api/embed) or LM Studio
 * (/v1/embeddings). Nothing is sent to the cloud, so Private mode is unaffected. Embedding models are found by name
 * (or LM Studio's type), because chat model lists leave them out.
 */
import { PROVIDER_INFO, type ProviderConfig, type Settings } from '../store/settings';
import { hasProviderPermission } from './permissions';
import type { Statuses } from './run';
import { AiError } from './types';

export type EmbedProvider = 'ollama' | 'lmstudio';
export const EMBED_PROVIDERS: EmbedProvider[] = ['ollama', 'lmstudio'];

export interface Embedder {
  provider: EmbedProvider;
  model: string;
}

/** "ollama:nomic-embed-text" — how the chosen model is stored and how captures remember which model made a vector. */
export const embedderKey = (e: Embedder) => `${e.provider}:${e.model}`;
export function parseEmbedder(key: string): Embedder | null {
  const at = key.indexOf(':');
  const p = key.slice(0, at);
  if (at < 1 || !EMBED_PROVIDERS.includes(p as EmbedProvider) || !key.slice(at + 1)) return null;
  return { provider: p as EmbedProvider, model: key.slice(at + 1) };
}

export const EMBED_RE = /embed|bge|minilm|\be5\b|e5-|gte-|\bgte\b|arctic-embed|mxbai|granite-embedding|nomic/i;

async function getJson(url: string, init: RequestInit, fetcher: typeof fetch): Promise<unknown> {
  const res = await fetcher(url, init);
  if (!res.ok) throw new AiError(`The embedding model answered ${res.status}.`, res.status === 403 ? 'permission' : 'server');
  return res.json();
}

/** Embedding models on one local provider. */
export async function listEmbedModels(id: EmbedProvider, cfg: ProviderConfig, fetcher: typeof fetch = fetch): Promise<string[]> {
  if (id === 'ollama') {
    const tags = (await getJson(`${cfg.baseUrl}/api/tags`, {}, fetcher)) as { models?: Array<{ name: string }> };
    return (tags.models ?? []).map((m) => m.name).filter((n) => EMBED_RE.test(n));
  }
  try {
    const body = (await getJson(`${cfg.baseUrl}/api/v0/models`, {}, fetcher)) as { data?: Array<{ id: string; type?: string }> };
    return (body.data ?? []).filter((m) => m.type === 'embeddings' || EMBED_RE.test(m.id)).map((m) => m.id);
  } catch {
    const body = (await getJson(`${cfg.baseUrl}/v1/models`, {}, fetcher)) as { data?: Array<{ id: string }> };
    return (body.data ?? []).map((m) => m.id).filter((n) => EMBED_RE.test(n));
  }
}

/** One vector per text. */
export async function embedTexts(e: Embedder, cfg: ProviderConfig, texts: string[], fetcher: typeof fetch = fetch): Promise<number[][]> {
  if (!texts.length) return [];
  const init = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let vectors: unknown;
  try {
    if (e.provider === 'ollama') vectors = ((await getJson(`${cfg.baseUrl}/api/embed`, init({ model: e.model, input: texts }), fetcher)) as { embeddings?: unknown }).embeddings;
    else vectors = ((await getJson(`${cfg.baseUrl}/v1/embeddings`, init({ model: e.model, input: texts }), fetcher)) as { data?: Array<{ embedding?: unknown; index?: number }> }).data?.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError(`Couldn’t reach ${PROVIDER_INFO[e.provider].name}.`, 'network');
  }
  if (!Array.isArray(vectors) || vectors.length !== texts.length || !vectors.every((v) => Array.isArray(v) && v.length && v.every((x) => typeof x === 'number' && Number.isFinite(x))))
    throw new AiError('The embedding model returned something unexpected.', 'model');
  return vectors as number[][];
}

/** The text that stands for a capture's meaning: what it is, its keywords, the user's note and the start of its text. */
export function embedText(c: { ai: { description?: string; keywords?: string[]; topics?: string[] }; detection?: { description: string }; notes: string; ocr?: { text: string }; source: { title: string } }): string {
  return [c.ai.description ?? c.detection?.description ?? '', [...(c.ai.topics ?? []), ...(c.ai.keywords ?? [])].join(', '), c.source.title, c.notes, (c.ocr?.text ?? '').slice(0, 1800)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');
}

const found = new Map<EmbedProvider, { at: number; models: string[] }>();

/**
 * The embedding model to use now: the one chosen in Settings if its provider is ready, otherwise the first embedding
 * model on a ready local provider. Null when search by meaning is off or no local embedding model exists.
 */
export async function pickEmbedder(s: Settings, statuses: Statuses, fetcher: typeof fetch = fetch): Promise<Embedder | null> {
  if (!s.semantic.enabled) return null;
  const chosen = parseEmbedder(s.semantic.model);
  const ready = EMBED_PROVIDERS.filter((p) => statuses[p]?.state === 'ready' && s.providers[p].enabled);
  if (chosen && ready.includes(chosen.provider)) return chosen;
  for (const p of ready) {
    const cached = found.get(p);
    let models = cached && Date.now() - cached.at < 60_000 ? cached.models : null;
    if (!models) {
      if (!(await hasProviderPermission(p, s.providers[p]))) continue;
      models = await listEmbedModels(p, s.providers[p], fetcher).catch(() => []);
      found.set(p, { at: Date.now(), models });
    }
    if (models[0]) return { provider: p, model: models[0] };
  }
  return null;
}

export function forgetEmbedModels(): void {
  found.clear();
}
