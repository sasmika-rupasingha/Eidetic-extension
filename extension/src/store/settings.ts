/**
 * User settings: one validated object in chrome.storage.local. API keys stay on this device and are sent only to
 * their own provider. Every read goes through validateSettings, so a damaged or old value can't break the app.
 */

export const PROVIDER_IDS = ['builtin', 'ollama', 'lmstudio', 'gemini', 'openai', 'anthropic', 'openrouter', 'custom'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** What kind of work a request is; the router picks a model per class. */
export const TASK_CLASSES = ['quick', 'code', 'reason', 'vision', 'translate'] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

export const TASK_CLASS_LABEL: Record<TaskClass, string> = {
  quick: 'Summaries, notes and flashcards',
  code: 'Errors and code',
  reason: 'Solving, research and questions',
  vision: 'Describing charts and screenshots',
  translate: 'Translation',
};

export type Mode = 'auto' | 'manual' | 'private';
export type Accent = 'ultramarine' | 'vermilion' | 'moss' | 'graphite';
export type ThemePref = 'system' | 'light' | 'dark';
export type ProfileId = 'study' | 'developer' | 'research' | 'writing' | 'general';
export const PROFILE_IDS = ['general', 'study', 'developer', 'research', 'writing'] as const satisfies readonly ProfileId[];
/** Longest custom answer style kept (it goes into every AI request's system prompt). */
export const PROFILE_STYLE_MAX = 600;

export interface ModelInfo {
  id: string;
  /** true / false when known (from the provider or a real request), null when unknown. */
  vision: boolean | null;
  code: boolean;
  /** Context window in tokens, when the provider says. */
  context?: number;
  /** Parameter count in billions, when the name or provider says (used to rank local models). */
  sizeB?: number;
  /** Download size in bytes (local models). */
  bytes?: number;
}

export interface ProviderConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  models: ModelInfo[];
  /** The model used when this provider is picked without a more specific choice. */
  defaultModel: string;
}

export interface ModelRef {
  provider: ProviderId;
  model: string;
}

export interface Settings {
  version: 1;
  theme: ThemePref;
  accent: Accent;
  mode: Mode;
  profile: ProfileId;
  /** The user's own wording for a profile's answer style; a missing entry uses the built-in style. */
  profileStyles: Partial<Record<ProfileId, string>>;
  providers: Record<ProviderId, ProviderConfig>;
  /** Manual mode: the model for each kind of task. */
  manual: Partial<Record<TaskClass, ModelRef>>;
  /** Send the captured image (not only its text) to models that can see. */
  sendImages: boolean;
  /** Temporary captures are removed after this many days; 0 keeps everything. */
  tempDays: number;
  ocrLanguages: string[];
  translateTo: string;
  searchEngine: 'google' | 'bing' | 'duckduckgo';
  onboarded: boolean;
  /** Search by meaning with a local embedding model; model is 'ollama:name' / 'lmstudio:name', or '' to pick one automatically. */
  semantic: { enabled: boolean; model: string };
}

export interface ProviderInfo {
  name: string;
  kind: 'builtin' | 'openai' | 'gemini' | 'anthropic';
  baseUrl: string;
  needsKey: boolean;
  local: boolean;
  where: string;
  keyUrl?: string;
  note: string;
}

export const PROVIDER_INFO: Record<ProviderId, ProviderInfo> = {
  builtin: { name: 'Chrome built-in AI', kind: 'builtin', baseUrl: '', needsKey: false, local: true, where: 'On this computer', note: 'Gemini Nano inside Chrome. Free and private; needs a capable PC.' },
  ollama: { name: 'Ollama', kind: 'openai', baseUrl: 'http://localhost:11434', needsKey: false, local: true, where: 'On this computer', note: 'Free models running on your own computer.' },
  lmstudio: { name: 'LM Studio', kind: 'openai', baseUrl: 'http://localhost:1234', needsKey: false, local: true, where: 'On this computer', note: 'Free models running on your own computer.' },
  gemini: { name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsKey: true, local: false, where: 'Google servers', keyUrl: 'https://aistudio.google.com/apikey', note: 'Free tier with a key from Google AI Studio.' },
  openai: { name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, local: false, where: 'OpenAI servers', keyUrl: 'https://platform.openai.com/api-keys', note: 'Pay per use. A ChatGPT subscription is not an API key.' },
  anthropic: { name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, local: false, where: 'Anthropic servers', keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Pay per use. A Claude subscription is not an API key.' },
  openrouter: { name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, local: false, where: 'OpenRouter servers', keyUrl: 'https://openrouter.ai/keys', note: 'One key for models from many companies, some free.' },
  custom: { name: 'OpenAI-compatible', kind: 'openai', baseUrl: '', needsKey: false, local: false, where: 'An address you choose', note: 'Any server that speaks the OpenAI chat API (vLLM, LocalAI, …).' },
};

/** A custom server on localhost counts as local (Private mode allows it). */
export function isLocal(id: ProviderId, cfg: ProviderConfig): boolean {
  if (PROVIDER_INFO[id].local) return true;
  if (id !== 'custom') return false;
  try {
    const h = new URL(cfg.baseUrl).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

export const OCR_LANGUAGES: Record<string, string> = {
  eng: 'English', sin: 'Sinhala', tam: 'Tamil', hin: 'Hindi', ara: 'Arabic', chi_sim: 'Chinese (simplified)', jpn: 'Japanese', kor: 'Korean',
  fra: 'French', deu: 'German', spa: 'Spanish', ita: 'Italian', por: 'Portuguese', rus: 'Russian', tur: 'Turkish', vie: 'Vietnamese',
};

export const TRANSLATE_LANGUAGES: Record<string, string> = {
  en: 'English', si: 'Sinhala', ta: 'Tamil', hi: 'Hindi', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ru: 'Russian', tr: 'Turkish', vi: 'Vietnamese',
};

const emptyProvider = (id: ProviderId): ProviderConfig => ({ enabled: id === 'builtin', apiKey: '', baseUrl: PROVIDER_INFO[id].baseUrl, models: [], defaultModel: '' });

export function defaultSettings(): Settings {
  return {
    version: 1,
    theme: 'system',
    accent: 'ultramarine',
    mode: 'auto',
    profile: 'general',
    profileStyles: {},
    providers: Object.fromEntries(PROVIDER_IDS.map((id) => [id, emptyProvider(id)])) as Record<ProviderId, ProviderConfig>,
    manual: {},
    sendImages: true,
    tempDays: 7,
    ocrLanguages: ['eng'],
    translateTo: 'en',
    searchEngine: 'google',
    onboarded: false,
    semantic: { enabled: true, model: '' },
  };
}

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback);
const str = (v: unknown, fallback = '', max = 2000) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

function validModel(v: unknown): ModelInfo | null {
  const m = v as Partial<ModelInfo> | null;
  if (!m || typeof m.id !== 'string' || !m.id) return null;
  return {
    id: m.id.slice(0, 200),
    vision: typeof m.vision === 'boolean' ? m.vision : null,
    code: Boolean(m.code),
    ...(typeof m.context === 'number' ? { context: m.context } : {}),
    ...(typeof m.sizeB === 'number' ? { sizeB: m.sizeB } : {}),
    ...(typeof m.bytes === 'number' ? { bytes: m.bytes } : {}),
  };
}

/** Normalises a base URL: no trailing slash, http(s) only. Returns '' for anything else. */
export function cleanBaseUrl(v: string): string {
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function validateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rp = (r.providers && typeof r.providers === 'object' ? r.providers : {}) as Record<string, Partial<ProviderConfig>>;
  const providers = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_IDS) {
    const p = rp[id] ?? {};
    const models = Array.isArray(p.models) ? p.models.map(validModel).filter((m): m is ModelInfo => Boolean(m)).slice(0, 300) : [];
    const baseUrl = id === 'builtin' ? '' : cleanBaseUrl(str(p.baseUrl, d.providers[id].baseUrl)) || d.providers[id].baseUrl;
    providers[id] = { enabled: typeof p.enabled === 'boolean' ? p.enabled : d.providers[id].enabled, apiKey: str(p.apiKey, '', 400).trim(), baseUrl, models, defaultModel: str(p.defaultModel, '', 200) };
  }
  const manual: Settings['manual'] = {};
  const rm = (r.manual && typeof r.manual === 'object' ? r.manual : {}) as Record<string, Partial<ModelRef>>;
  for (const t of TASK_CLASSES) {
    const m = rm[t];
    if (m && typeof m.model === 'string') manual[t] = { provider: oneOf(m.provider, PROVIDER_IDS, 'builtin'), model: m.model.slice(0, 200) };
  }
  const profileStyles: Settings['profileStyles'] = {};
  const rs = (r.profileStyles && typeof r.profileStyles === 'object' ? r.profileStyles : {}) as Record<string, unknown>;
  for (const p of PROFILE_IDS) {
    const v = str(rs[p], '', PROFILE_STYLE_MAX).trim();
    if (v) profileStyles[p] = v;
  }
  const langs = Array.isArray(r.ocrLanguages) ? r.ocrLanguages.filter((l): l is string => typeof l === 'string' && l in OCR_LANGUAGES).slice(0, 4) : [];
  return {
    version: 1,
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, d.theme),
    accent: oneOf(r.accent, ['ultramarine', 'vermilion', 'moss', 'graphite'] as const, d.accent),
    mode: oneOf(r.mode, ['auto', 'manual', 'private'] as const, d.mode),
    profile: oneOf(r.profile, PROFILE_IDS, d.profile),
    profileStyles,
    providers,
    manual,
    sendImages: typeof r.sendImages === 'boolean' ? r.sendImages : d.sendImages,
    tempDays: num(r.tempDays, d.tempDays, 0, 365),
    ocrLanguages: langs.length ? langs : d.ocrLanguages,
    translateTo: oneOf(r.translateTo, Object.keys(TRANSLATE_LANGUAGES), d.translateTo),
    searchEngine: oneOf(r.searchEngine, ['google', 'bing', 'duckduckgo'] as const, d.searchEngine),
    onboarded: Boolean(r.onboarded),
    semantic: (() => {
      const sm = (r.semantic && typeof r.semantic === 'object' ? r.semantic : {}) as Record<string, unknown>;
      const model = str(sm.model, '', 240);
      return { enabled: typeof sm.enabled === 'boolean' ? sm.enabled : true, model: /^(ollama|lmstudio):.+/.test(model) ? model : '' };
    })(),
  };
}

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEY);
  return validateSettings(got[KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: validateSettings(s) });
}

export async function updateSettings(change: (s: Settings) => Settings | void): Promise<Settings> {
  const cur = await loadSettings();
  const draft = structuredClone(cur);
  const next = change(draft) ?? draft;
  await saveSettings(next);
  return validateSettings(next);
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb(validateSettings(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(fn);
  return () => chrome.storage.onChanged.removeListener(fn);
}

export function searchUrl(engine: Settings['searchEngine'], q: string): string {
  const e = encodeURIComponent(q.slice(0, 500));
  if (engine === 'bing') return `https://www.bing.com/search?q=${e}`;
  if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${e}`;
  return `https://www.google.com/search?q=${e}`;
}
