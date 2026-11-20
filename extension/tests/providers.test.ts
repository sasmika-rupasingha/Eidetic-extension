import { describe, expect, it, vi } from 'vitest';
import { anthropicRequest, deltaOf, geminiRequest, httpError, openaiRequest, sseData, streamHttp } from '../src/ai/http';
import { discoverModels } from '../src/ai/hub';
import { validateSettings } from '../src/store/settings';
import type { ChatRequest } from '../src/ai/types';

const s = validateSettings({
  providers: {
    gemini: { enabled: true, apiKey: 'g-key' },
    openai: { enabled: true, apiKey: 'o-key' },
    anthropic: { enabled: true, apiKey: 'a-key' },
    openrouter: { enabled: true, apiKey: 'r-key' },
    ollama: { enabled: true },
  },
});
const req: ChatRequest = { system: 'SYS', messages: [{ role: 'user', text: 'Hi', image: { mime: 'image/png', base64: 'AAAA' } }] };
const body = (init: RequestInit) => JSON.parse(String(init.body));

function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe('request builders', () => {
  it('Gemini: key header, system instruction, image part, model without prefix', () => {
    const r = geminiRequest(s.providers.gemini, 'models/gemini-test', { ...req, json: true });
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse');
    expect(r.init.headers['x-goog-api-key']).toBe('g-key');
    const b = body(r.init);
    expect(b.systemInstruction.parts[0].text).toBe('SYS');
    expect(b.contents[0].parts[0].inline_data).toEqual({ mime_type: 'image/png', data: 'AAAA' });
    expect(b.generationConfig.responseMimeType).toBe('application/json');
  });

  it('OpenAI-compatible: bearer key, system message, image_url data URL', () => {
    const r = openaiRequest('openai', s.providers.openai, 'gpt-test', req);
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.init.headers.authorization).toBe('Bearer o-key');
    const b = body(r.init);
    expect(b.stream).toBe(true);
    expect(b.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(b.messages[1].content[1].image_url.url).toBe('data:image/png;base64,AAAA');
  });

  it('OpenRouter adds attribution headers; Ollama sends no key', () => {
    expect(openaiRequest('openrouter', s.providers.openrouter, 'some/model', req).init.headers['X-Title']).toBe('Eidetic');
    const ollama = openaiRequest('ollama', s.providers.ollama, 'llama', req);
    expect(ollama.init.headers.authorization).toBeUndefined();
    expect(ollama.url).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('Anthropic: browser header, version, base64 image block', () => {
    const r = anthropicRequest(s.providers.anthropic, 'claude-test', req);
    expect(r.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(r.init.headers['anthropic-version']).toBe('2023-06-01');
    const b = body(r.init);
    expect(b.system).toBe('SYS');
    expect(b.messages[0].content[0].source).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAAA' });
  });
});

describe('stream parsing', () => {
  it('reads events split across network chunks', async () => {
    const out: string[] = [];
    for await (const d of sseData(sse(['data: {"a":', '1}\n\ndata: two\r\n\r\n', 'data: [DONE]\n\n']))) out.push(d);
    expect(out).toEqual(['{"a":1}', 'two', '[DONE]']);
  });

  it('extracts text deltas for each provider', () => {
    expect(deltaOf('gemini', '{"candidates":[{"content":{"parts":[{"text":"Hel"},{"text":"lo"}]}}]}').text).toBe('Hello');
    expect(deltaOf('gemini', '{"candidates":[{"content":{"parts":[{"text":"plan","thought":true}]}}]}').text).toBeNull();
    expect(deltaOf('openai', '{"choices":[{"delta":{"content":"Hi"}}]}').text).toBe('Hi');
    expect(deltaOf('anthropic', '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}').text).toBe('Yo');
    expect(deltaOf('anthropic', '{"type":"message_start"}').text).toBeNull();
    expect(deltaOf('openai', '{"error":{"message":"bad"}}').error).toBe('bad');
    expect(deltaOf('openai', '[DONE]').text).toBeNull();
  });

  it('streams a whole answer and reports progress', async () => {
    const fetcher = vi.fn(async () => new Response(sse(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n']), { status: 200 }));
    const seen: string[] = [];
    const out = await streamHttp('openai', s.providers.openai, 'gpt-test', req, { onText: (t: string) => seen.push(t) }, fetcher as unknown as typeof fetch);
    expect(out).toBe('Hello');
    expect(seen).toEqual(['Hel', 'Hello']);
  });
});

describe('errors', () => {
  const res = (status: number, msg = 'm') => new Response(JSON.stringify({ error: { message: msg } }), { status });
  it('maps status codes to clear messages and hints', async () => {
    expect((await httpError('gemini', res(401))).code).toBe('auth');
    expect((await httpError('openai', res(429))).code).toBe('quota');
    expect((await httpError('openai', res(404))).hint).toContain('Settings');
    const local = await httpError('ollama', new Response('forbidden', { status: 403 }));
    expect(local.code).toBe('permission');
    expect(local.hint).toContain('OLLAMA_ORIGINS');
  });

  it('explains a network failure for local servers', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(streamHttp('ollama', s.providers.ollama, 'llama', req, {}, fetcher as unknown as typeof fetch)).rejects.toMatchObject({ code: 'network', hint: expect.stringContaining('11434') });
  });

  it('treats an empty answer as an error', async () => {
    const fetcher = vi.fn(async () => new Response(sse(['data: [DONE]\n\n']), { status: 200 }));
    await expect(streamHttp('openai', s.providers.openai, 'gpt-test', req, {}, fetcher as unknown as typeof fetch)).rejects.toMatchObject({ code: 'server' });
  });
});

describe('model discovery', () => {
  it('lists Gemini chat models without embeddings, all able to see images', async () => {
    const fetcher = vi.fn(async () => Response.json({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1000 }, { name: 'models/text-embedding-4', supportedGenerationMethods: ['embedContent'] }] }));
    expect(await discoverModels('gemini', s.providers.gemini, fetcher as unknown as typeof fetch)).toEqual([{ id: 'gemini-a', vision: true, code: false, context: 1000 }]);
    expect((fetcher.mock.calls[0] as unknown[])[1]).toMatchObject({ headers: { 'x-goog-api-key': 'g-key' } });
  });
  it('lists OpenAI-compatible models without audio/image ones', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ id: 'gpt-4o' }, { id: 'whisper-1' }, { id: 'text-embedding-3' }] }));
    expect((await discoverModels('openai', s.providers.openai, fetcher as unknown as typeof fetch)).map((m) => m.id)).toEqual(['gpt-4o']);
  });
  it('reads Ollama capabilities and context from /api/show', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/api/tags')
        ? Response.json({ models: [{ name: 'qwen2.5-coder:7b', size: 4700000000, details: { parameter_size: '7.6B' } }, { name: 'llava:7b', details: { parameter_size: '7B', families: ['llama', 'clip'] } }, { name: 'nomic-embed-text' }] })
        : Response.json({ capabilities: ['completion'], model_info: { 'qwen2.context_length': 32768 } }),
    );
    const models = await discoverModels('ollama', s.providers.ollama, fetcher as unknown as typeof fetch);
    expect(models.map((m) => m.id)).toEqual(['qwen2.5-coder:7b', 'llava:7b']);
    expect(models[0]).toMatchObject({ code: true, vision: false, sizeB: 7.6, context: 32768, bytes: 4700000000 });
  });
  it('reads LM Studio model types (vlm = can see)', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ id: 'qwen2-vl-7b', type: 'vlm', max_context_length: 8192 }, { id: 'llama-3.1-8b', type: 'llm' }, { id: 'nomic', type: 'embeddings' }] }));
    const models = await discoverModels('lmstudio', s.providers.lmstudio, fetcher as unknown as typeof fetch);
    expect(models).toEqual([
      { id: 'qwen2-vl-7b', vision: true, code: false, sizeB: 7, context: 8192 },
      { id: 'llama-3.1-8b', vision: false, code: false, sizeB: 8 },
    ]);
  });
});
