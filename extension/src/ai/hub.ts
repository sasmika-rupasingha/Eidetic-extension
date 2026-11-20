/**
 * AI Model Hub: what each provider has, what each model can do, and whether it is reachable right now.
 * Capabilities come from the provider when it says (Ollama /api/show, LM Studio /api/v0/models), otherwise from the
 * model's name; a model that later rejects an image is marked text-only (see run.ts).
 */
import { PROVIDER_INFO, type ModelInfo, type ProviderConfig, type ProviderId } from '../store/settings';
import { builtinStatus } from './builtin';
import { httpError, openaiBase } from './http';
import { hasProviderPermission } from './permissions';
import { AiError } from './types';

export type ProviderState = 'ready' | 'offline' | 'needs-setup' | 'no-permission' | 'refused' | 'unsupported' | 'error';

export interface ProviderStatus {
  state: ProviderState;
  message: string;
  hint?: string;
  models: ModelInfo[];
  checkedAt: number;
}

const VISION_RE = /(llava|bakllava|vision|[-_.]vl\b|vl[-_:]|pixtral|gemma3|gemma-3|qwen2\.5vl|qwen2\.5-vl|qwen-vl|qwen3-vl|minicpm-v|moondream|granite3\.2-vision|llama3\.2-vision|llama4|mistral-small3\.1|gpt-4o|gpt-4\.1|gpt-5|o3|o4|claude-(3|sonnet|opus|haiku)|gemini)/i;
const CODE_RE = /(coder|code|codestral|starcoder|deepseek-coder|devstral|codegemma|codellama|qwen3-coder)/i;

export const guessVision = (id: string): boolean | null => (VISION_RE.test(id) ? true : null);
export const guessCode = (id: string): boolean => CODE_RE.test(id);

/** Parameter count from a name or a size string: "qwen2.5:7b" → 7, "8x7b" → 56, "7.6B" → 7.6, "270m" → 0.27. */
export function guessSizeB(s: string): number | undefined {
  const moe = /(\d+)x(\d+(?:\.\d+)?)b\b/i.exec(s);
  if (moe) return Number(moe[1]) * Number(moe[2]);
  const b = /(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*b\b/i.exec(s);
  if (b) return Number(b[1]);
  const m = /(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*m\b/i.exec(s);
  if (m) return Number(m[1]) / 1000;
  return undefined;
}

const noise = /embed|whisper|tts|dall-e|moderation|transcribe|image|audio|realtime|rerank|imagen|veo|aqa/i;

function cloudModel(id: string): ModelInfo {
  return { id, vision: guessVision(id), code: guessCode(id) };
}

async function getJson(url: string, init: RequestInit, id: ProviderId, fetcher: typeof fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url, init);
  } catch {
    throw new AiError(`Couldn’t reach ${PROVIDER_INFO[id].name}.`, 'network', PROVIDER_INFO[id].local ? offlineHint(id) : 'Check your internet connection.');
  }
  if (!res.ok) throw await httpError(id, res);
  return res.json();
}

export function offlineHint(id: ProviderId): string {
  if (id === 'ollama') return 'Start Ollama on this computer (it listens on localhost:11434), then press Retry.';
  if (id === 'lmstudio') return 'Open LM Studio, go to the Developer tab and start the server, then press Retry.';
  return 'Make sure the server is running, then press Retry.';
}

/** Reads the provider's model list with capabilities. Throws AiError with a clear hint on failure. */
export async function discoverModels(id: ProviderId, cfg: ProviderConfig, fetcher: typeof fetch = fetch): Promise<ModelInfo[]> {
  if (id === 'builtin') {
    const st = await builtinStatus();
    if (st.prompt === 'unavailable') return [];
    return [{ id: 'gemini-nano', vision: st.image === 'available', code: false, sizeB: 2 }];
  }
  if (id === 'ollama') {
    const tags = (await getJson(`${cfg.baseUrl}/api/tags`, {}, id, fetcher)) as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string; families?: string[] } }> };
    const list = (tags.models ?? []).filter((m) => !noise.test(m.name));
    return Promise.all(
      list.map(async (m): Promise<ModelInfo> => {
        const base: ModelInfo = { id: m.name, vision: guessVision(m.name), code: guessCode(m.name), sizeB: guessSizeB(m.details?.parameter_size ?? '') ?? guessSizeB(m.name), ...(m.size ? { bytes: m.size } : {}) };
        if (m.details?.families?.some((f) => /clip|mllama/i.test(f))) base.vision = true;
        try {
          const show = (await getJson(`${cfg.baseUrl}/api/show`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: m.name }) }, id, fetcher)) as { capabilities?: string[]; model_info?: Record<string, unknown> };
          if (Array.isArray(show.capabilities)) base.vision = show.capabilities.includes('vision');
          const ctx = Object.entries(show.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))?.[1];
          if (typeof ctx === 'number') base.context = ctx;
        } catch {
          /* older Ollama: keep what the name says */
        }
        return base;
      }),
    );
  }
  if (id === 'lmstudio') {
    try {
      const body = (await getJson(`${cfg.baseUrl}/api/v0/models`, {}, id, fetcher)) as { data?: Array<{ id: string; type?: string; max_context_length?: number }> };
      return (body.data ?? [])
        .filter((m) => m.type !== 'embeddings' && !noise.test(m.id))
        .map((m) => ({ id: m.id, vision: m.type === 'vlm' ? true : m.type === 'llm' ? false : guessVision(m.id), code: guessCode(m.id), sizeB: guessSizeB(m.id), ...(m.max_context_length ? { context: m.max_context_length } : {}) }));
    } catch (e) {
      if (e instanceof AiError && e.code === 'network') throw e;
      // Older LM Studio without the v0 API: the OpenAI-compatible list has names only.
    }
  }
  const kind = PROVIDER_INFO[id].kind;
  if (kind === 'gemini') {
    const body = (await getJson(`${cfg.baseUrl}/models?pageSize=200`, { headers: { 'x-goog-api-key': cfg.apiKey } }, id, fetcher)) as { models?: Array<{ name: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }> };
    return (body.models ?? [])
      .filter((m) => (!m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')) && !noise.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), vision: true, code: false, ...(m.inputTokenLimit ? { context: m.inputTokenLimit } : {}) }));
  }
  if (kind === 'anthropic') {
    const body = (await getJson(`${cfg.baseUrl}/models?limit=100`, { headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }, id, fetcher)) as { data?: Array<{ id: string }> };
    return (body.data ?? []).map((m) => ({ id: m.id, vision: true, code: false }));
  }
  const headers: Record<string, string> = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
  const body = (await getJson(`${openaiBase(id, cfg)}/models`, { headers }, id, fetcher)) as { data?: Array<{ id: string }> };
  return (body.data ?? []).map((m) => m.id).filter((n) => !noise.test(n)).map(id === 'lmstudio' || id === 'custom' ? (n) => ({ ...cloudModel(n), sizeB: guessSizeB(n) }) : cloudModel);
}

/** Checks one provider: set up? allowed? reachable? Returns its models when ready. */
export async function checkProvider(id: ProviderId, cfg: ProviderConfig, fetcher: typeof fetch = fetch): Promise<ProviderStatus> {
  const at = Date.now();
  const info = PROVIDER_INFO[id];
  if (id === 'builtin') {
    const st = await builtinStatus();
    if (st.prompt === 'unavailable') return { state: 'unsupported', message: 'Not available on this computer', hint: 'Needs desktop Google Chrome 138+ on a capable PC.', models: [], checkedAt: at };
    if (st.prompt !== 'available') return { state: 'needs-setup', message: 'Model not downloaded', hint: 'Download it once (about 4 GB).', models: [], checkedAt: at };
    return { state: 'ready', message: 'Ready · Gemini Nano', models: await discoverModels(id, cfg, fetcher), checkedAt: at };
  }
  if (!cfg.enabled) return { state: 'needs-setup', message: 'Not set up', models: [], checkedAt: at };
  if (!cfg.baseUrl) return { state: 'needs-setup', message: 'No server address', models: [], checkedAt: at };
  if (info.needsKey && !cfg.apiKey) return { state: 'needs-setup', message: 'Needs an API key', models: [], checkedAt: at };
  if (!(await hasProviderPermission(id, cfg))) return { state: 'no-permission', message: 'Not allowed yet', hint: 'Press Connect to let Eidetic contact this address.', models: [], checkedAt: at };
  try {
    const models = await discoverModels(id, cfg, fetcher);
    if (!models.length) return { state: 'error', message: 'No models found', hint: id === 'ollama' ? 'Download one first, for example: ollama pull qwen2.5:7b' : id === 'lmstudio' ? 'Download and load a model in LM Studio.' : 'This key has no chat models.', models, checkedAt: at };
    return { state: 'ready', message: `Connected · ${models.length} model${models.length === 1 ? '' : 's'}`, models, checkedAt: at };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(String(e), 'server');
    const state: ProviderState = err.code === 'network' ? 'offline' : err.code === 'permission' ? 'refused' : 'error';
    const message = state === 'offline' ? (info.local ? 'Not running' : 'Can’t connect') : state === 'refused' ? 'Refused the extension' : err.message;
    return { state, message, hint: err.hint || undefined, models: [], checkedAt: at };
  }
}
