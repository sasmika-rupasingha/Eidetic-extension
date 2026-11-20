/**
 * Cloud and local providers over HTTP (ported from Lumen, where every wire format is unit-tested). Request builders and stream parsers are pure functions so every
 * provider's wire format is unit-tested without a network.
 */
import { PROVIDER_INFO, type ProviderConfig, type ProviderId } from '../store/settings';
import { AiError, type ChatRequest, type HttpRequest, type StreamOptions } from './types';

const json = (body: unknown) => JSON.stringify(body);

export function geminiRequest(cfg: ProviderConfig, modelId: string, req: ChatRequest): HttpRequest {
  const model = modelId.replace(/^models\//, '');
  return {
    url: `${cfg.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: json({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [...(m.image ? [{ inline_data: { mime_type: m.image.mime, data: m.image.base64 } }] : []), { text: m.text }],
        })),
        generationConfig: { temperature: 0.3, maxOutputTokens: req.maxTokens ?? 2048, ...(req.json ? { responseMimeType: 'application/json' } : {}) },
      }),
    },
  };
}

export function openaiRequest(id: ProviderId, cfg: ProviderConfig, model: string, req: ChatRequest): HttpRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  if (id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/sasmika-rupasingha/eidetic';
    headers['X-Title'] = 'Eidetic';
  }
  return {
    url: `${openaiBase(id, cfg)}/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: json({
        model,
        stream: true,
        temperature: 0.3,
        max_tokens: req.maxTokens ?? 2048,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({
            role: m.role,
            content: m.image ? [{ type: 'text', text: m.text }, { type: 'image_url', image_url: { url: `data:${m.image.mime};base64,${m.image.base64}` } }] : m.text,
          })),
        ],
      }),
    },
  };
}

export function anthropicRequest(cfg: ProviderConfig, model: string, req: ChatRequest): HttpRequest {
  return {
    url: `${cfg.baseUrl}/messages`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for calls made directly from a browser; the key is the user's own and stays on their device.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: json({
        model,
        max_tokens: req.maxTokens ?? 2048,
        temperature: 0.3,
        stream: true,
        system: req.system,
        messages: req.messages.map((m) => ({
          role: m.role,
          content: [...(m.image ? [{ type: 'image', source: { type: 'base64', media_type: m.image.mime, data: m.image.base64 } }] : []), { type: 'text', text: m.text }],
        })),
      }),
    },
  };
}

/** Ollama and LM Studio keep their native API at the root and the OpenAI-compatible one under /v1. */
export function openaiBase(id: ProviderId, cfg: ProviderConfig): string {
  return id === 'ollama' || id === 'lmstudio' ? `${cfg.baseUrl}/v1` : cfg.baseUrl;
}

export function buildRequest(id: ProviderId, cfg: ProviderConfig, model: string, req: ChatRequest): HttpRequest {
  const kind = PROVIDER_INFO[id].kind;
  if (kind === 'gemini') return geminiRequest(cfg, model, req);
  if (kind === 'anthropic') return anthropicRequest(cfg, model, req);
  if (kind === 'openai') return openaiRequest(id, cfg, model, req);
  throw new AiError('This provider does not use HTTP.', 'setup');
}

/** Pulls the new text out of one server-sent event, for each wire format. Returns null for events without text. */
export function deltaOf(kind: 'gemini' | 'openai' | 'anthropic', data: string): { text: string | null; error?: string } {
  if (data === '[DONE]') return { text: null };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return { text: null };
  }
  const err = (obj.error as { message?: string } | undefined)?.message;
  if (err) return { text: null, error: err };
  if (kind === 'gemini') {
    const parts = (obj.candidates as Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> | undefined)?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    return { text: text || null };
  }
  if (kind === 'anthropic') {
    if (obj.type === 'content_block_delta') return { text: ((obj.delta as { text?: string }) ?? {}).text ?? null };
    return { text: null };
  }
  const choice = (obj.choices as Array<{ delta?: { content?: string | null } }> | undefined)?.[0];
  return { text: choice?.delta?.content ?? null };
}

/** Reads a server-sent-events body and yields each event's data. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let at: number;
    while ((at = buf.indexOf('\n\n')) >= 0) {
      const event = buf.slice(0, at);
      buf = buf.slice(at + 2);
      const data = event
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) yield data;
    }
  }
  const rest = buf
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .join('\n');
  if (rest) yield rest;
}

/** Turns an HTTP error from any provider into a clear message with a hint. */
export async function httpError(id: ProviderId, res: Response): Promise<AiError> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    detail = (typeof body.error === 'string' ? body.error : body.error?.message) ?? body.message ?? '';
  } catch {
    /* not JSON */
  }
  const name = PROVIDER_INFO[id].name;
  const tail = detail ? ` (${detail.slice(0, 240)})` : '';
  if (res.status === 401 || (res.status === 403 && !PROVIDER_INFO[id].local) || /api key/i.test(detail)) return new AiError(`${name} rejected the API key${tail}.`, 'auth', 'Check the key in Settings › AI models.');
  if (res.status === 403 && PROVIDER_INFO[id].local)
    return new AiError(`${name} refused the request from the extension${tail}.`, 'permission', 'Allow browser extensions: set the environment variable OLLAMA_ORIGINS to chrome-extension://*,moz-extension://* and restart Ollama.');
  if (res.status === 429) return new AiError(`${name}: rate limit or quota reached${tail}.`, 'quota', 'Wait a minute, or choose another model in Settings › AI models.');
  if (res.status === 404) return new AiError(`${name} doesn’t know that model${tail}.`, 'model', 'Choose a model again in Settings › AI models.');
  if (res.status === 400) return new AiError(`${name} couldn’t use this request${tail}.`, 'model', 'If an image was sent, this model may not accept images.');
  return new AiError(`${name} returned an error ${res.status}${tail}.`, 'server');
}

export async function streamHttp(id: ProviderId, cfg: ProviderConfig, model: string, req: ChatRequest, opts: StreamOptions = {}, fetcher: typeof fetch = fetch): Promise<string> {
  const { url, init } = buildRequest(id, cfg, model, req);
  let res: Response;
  try {
    res = await fetcher(url, { ...init, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('Stopped.', 'cancelled');
    const local = PROVIDER_INFO[id].local;
    throw new AiError(`Couldn’t reach ${PROVIDER_INFO[id].name}.`, 'network', local ? 'Is it running? Ollama listens on http://localhost:11434; in LM Studio, start the server (Developer tab).' : 'Check your internet connection.');
  }
  if (!res.ok || !res.body) throw await httpError(id, res);
  const kind = PROVIDER_INFO[id].kind as 'gemini' | 'openai' | 'anthropic';
  let full = '';
  try {
    for await (const data of sseData(res.body)) {
      const d = deltaOf(kind, data);
      if (d.error) throw new AiError(`${PROVIDER_INFO[id].name}: ${d.error}`, 'server');
      if (d.text) {
        full += d.text;
        opts.onText?.(full);
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('Stopped.', 'cancelled');
    throw e;
  }
  if (!full.trim()) throw new AiError(`${PROVIDER_INFO[id].name} returned an empty answer.`, 'server', 'The model may have blocked the content. Try rephrasing or another model.');
  return full;
}
