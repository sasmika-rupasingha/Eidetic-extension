import { describe, expect, it, vi } from 'vitest';
import { embedText, embedTexts, listEmbedModels, parseEmbedder, pickEmbedder } from '../src/ai/embed';
import { cosine, needsEmbedding, rankByMeaning } from '../src/search/semantic';
import { defaultSettings } from '../src/store/settings';

const fakeFetch = (routes: Record<string, unknown>, seen: Array<{ url: string; body: unknown }> = []) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const path = new URL(url).pathname;
    if (!(path in routes)) return new Response('no', { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  }) as unknown as typeof fetch;

describe('cosine and ranking', () => {
  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 2], [1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it('ranks by meaning, same model only, after word results', () => {
    const caps = [
      { id: 'a', embedding: { model: 'm', vector: [1, 0] } },
      { id: 'b', embedding: { model: 'm', vector: [0.8, 0.6] } },
      { id: 'c', embedding: { model: 'other', vector: [1, 0] } },
      { id: 'd', embedding: { model: 'm', vector: [0, 1] } },
      { id: 'e' },
    ];
    expect(rankByMeaning(caps, [1, 0], 'm').map((m) => m.capture.id)).toEqual(['a', 'b']);
    expect(rankByMeaning(caps, [1, 0], 'm', ['a']).map((m) => m.capture.id)).toEqual(['b']);
  });
  it('finds captures that need a vector', () => {
    const caps = [
      { processing: 'done', embedding: { model: 'm' } },
      { processing: 'done', embedding: { model: 'old' } },
      { processing: 'done' },
      { processing: 'reading' },
    ];
    expect(needsEmbedding(caps, 'm')).toHaveLength(2);
  });
});

describe('local embeddings', () => {
  const s = defaultSettings();
  it('parses the stored model choice', () => {
    expect(parseEmbedder('ollama:nomic-embed-text:latest')).toEqual({ provider: 'ollama', model: 'nomic-embed-text:latest' });
    expect(parseEmbedder('openai:text-embedding-3')).toBeNull();
    expect(parseEmbedder('ollama:')).toBeNull();
  });
  it('lists embedding models on Ollama and LM Studio', async () => {
    const f = fakeFetch({ '/api/tags': { models: [{ name: 'qwen2.5:7b' }, { name: 'nomic-embed-text:latest' }, { name: 'bge-m3' }] } });
    expect(await listEmbedModels('ollama', s.providers.ollama, f)).toEqual(['nomic-embed-text:latest', 'bge-m3']);
    const lm = fakeFetch({ '/api/v0/models': { data: [{ id: 'qwen', type: 'llm' }, { id: 'text-embedding-nomic-embed-text-v1.5', type: 'embeddings' }] } });
    expect(await listEmbedModels('lmstudio', s.providers.lmstudio, lm)).toEqual(['text-embedding-nomic-embed-text-v1.5']);
  });
  it('calls /api/embed on Ollama and /v1/embeddings on LM Studio', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const f = fakeFetch({ '/api/embed': { embeddings: [[1, 2], [3, 4]] }, '/v1/embeddings': { data: [{ index: 1, embedding: [5] }, { index: 0, embedding: [6] }] } }, seen);
    expect(await embedTexts({ provider: 'ollama', model: 'e' }, s.providers.ollama, ['a', 'b'], f)).toEqual([[1, 2], [3, 4]]);
    expect(seen[0]).toEqual({ url: 'http://localhost:11434/api/embed', body: { model: 'e', input: ['a', 'b'] } });
    expect(await embedTexts({ provider: 'lmstudio', model: 'e' }, s.providers.lmstudio, ['a', 'b'], f)).toEqual([[6], [5]]);
    expect(seen[1]?.url).toBe('http://localhost:1234/v1/embeddings');
  });
  it('rejects malformed vectors', async () => {
    const f = fakeFetch({ '/api/embed': { embeddings: [['x']] } });
    await expect(embedTexts({ provider: 'ollama', model: 'e' }, s.providers.ollama, ['a'], f)).rejects.toThrow(/unexpected/);
  });
  it('picks only a ready local provider, or nothing when turned off', async () => {
    const chosen = { ...s, semantic: { enabled: true, model: 'ollama:nomic' }, providers: { ...s.providers, ollama: { ...s.providers.ollama, enabled: true } } };
    const ready = { ollama: { state: 'ready' as const, message: '', models: [], checkedAt: 0 } };
    expect(await pickEmbedder(chosen, ready)).toEqual({ provider: 'ollama', model: 'nomic' });
    expect(await pickEmbedder(chosen, {})).toBeNull();
    expect(await pickEmbedder({ ...chosen, semantic: { enabled: false, model: 'ollama:nomic' } }, ready)).toBeNull();
  });
  it('builds the text that stands for a capture', () => {
    const t = embedText({ ai: { description: 'Results table', topics: ['ML'] }, notes: 'for the report', ocr: { text: 'Model Accuracy' }, source: { title: 'Results' } });
    expect(t.split('\n')).toEqual(['Results table', 'ML', 'Results', 'for the report', 'Model Accuracy']);
  });
});

describe('a local provider with only embedding models', () => {
  it('counts as connected (for search by meaning) without offering chat models', async () => {
    const { checkProvider } = await import('../src/ai/hub');
    const { readyMap } = await import('../src/ai/run');
    vi.stubGlobal('chrome', { permissions: { contains: async () => true } });
    const cfg = { ...defaultSettings().providers.ollama, enabled: true };
    const st = await checkProvider('ollama', cfg, fakeFetch({ '/api/tags': { models: [{ name: 'nomic-embed-text:latest' }] } }));
    expect(st).toMatchObject({ state: 'ready', message: 'Connected · 1 embedding model only', models: [] });
    expect(st.hint).toMatch(/ollama pull qwen2.5:7b/);
    expect(readyMap({ ollama: st })).toEqual({});
    const none = await checkProvider('ollama', cfg, fakeFetch({ '/api/tags': { models: [] } }));
    expect(none.state).toBe('error');
    vi.unstubAllGlobals();
  });
});
