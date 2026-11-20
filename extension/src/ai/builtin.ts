/**
 * Chrome's built-in AI (Gemini Nano on the user's computer): Prompt, Translator, Language Detector and Summarizer APIs.
 * Everything is feature-detected; other browsers simply report "unavailable".
 */
import { AiError, type ChatRequest, type StreamOptions } from './types';
import { dataUrlToBlob } from '../shared/image';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LMSession {
  prompt(input: unknown, opts?: { signal?: AbortSignal; responseConstraint?: unknown }): Promise<string>;
  promptStreaming(input: unknown, opts?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}
interface Monitor {
  addEventListener(type: 'downloadprogress', cb: (e: { loaded: number }) => void): void;
}
interface LMStatic {
  availability(opts?: unknown): Promise<Availability>;
  create(opts?: unknown): Promise<LMSession>;
}
interface TranslatorStatic {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(opts: { sourceLanguage: string; targetLanguage: string; monitor?: (m: Monitor) => void }): Promise<{ translate(t: string): Promise<string>; destroy(): void }>;
}
interface DetectorStatic {
  availability(): Promise<Availability>;
  create(): Promise<{ detect(t: string): Promise<Array<{ detectedLanguage: string; confidence: number }>>; destroy(): void }>;
}
interface SummarizerStatic {
  availability(): Promise<Availability>;
  create(opts: unknown): Promise<{ summarize(t: string, o?: { context?: string; signal?: AbortSignal }): Promise<string>; destroy(): void }>;
}

const g = globalThis as unknown as { LanguageModel?: LMStatic; Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic; Summarizer?: SummarizerStatic };

export interface BuiltinStatus {
  prompt: Availability;
  image: Availability;
  translator: boolean;
  summarizer: Availability;
}

const LANG_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const IMAGE_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

export async function builtinStatus(): Promise<BuiltinStatus> {
  const safe = async (f: () => Promise<Availability>): Promise<Availability> => {
    try {
      return await f();
    } catch {
      return 'unavailable';
    }
  };
  return {
    prompt: g.LanguageModel ? await safe(() => g.LanguageModel!.availability(LANG_OPTS)) : 'unavailable',
    image: g.LanguageModel ? await safe(() => g.LanguageModel!.availability(IMAGE_OPTS)) : 'unavailable',
    translator: Boolean(g.Translator),
    summarizer: g.Summarizer ? await safe(() => g.Summarizer!.availability()) : 'unavailable',
  };
}

const UNAVAILABLE_HINT =
  'Chrome’s built-in AI needs desktop Chrome 138+, 22 GB free disk space and a GPU with more than 4 GB memory (or 16 GB RAM). Otherwise add a free Gemini key in Settings › AI models.';

/** Starts the one-time model download (needs a click, so call it from a button). */
export async function downloadBuiltin(onProgress: (fraction: number) => void): Promise<void> {
  if (!g.LanguageModel) throw new AiError('Built-in AI isn’t available in this browser.', 'unavailable', UNAVAILABLE_HINT);
  const s = await g.LanguageModel.create({ ...LANG_OPTS, monitor: (m: Monitor) => m.addEventListener('downloadprogress', (e) => onProgress(e.loaded)) });
  s.destroy();
}

export async function promptBuiltin(req: ChatRequest, opts: StreamOptions = {}): Promise<string> {
  if (!g.LanguageModel) throw new AiError('Built-in AI isn’t available in this browser.', 'unavailable', UNAVAILABLE_HINT);
  const last = req.messages[req.messages.length - 1];
  if (!last) throw new AiError('Nothing to ask.', 'setup');
  const withImage = Boolean(last.image) && (await g.LanguageModel.availability(IMAGE_OPTS).catch(() => 'unavailable')) === 'available';
  const base = withImage ? IMAGE_OPTS : LANG_OPTS;
  const avail = await g.LanguageModel.availability(base).catch(() => 'unavailable' as const);
  if (avail === 'unavailable') throw new AiError('Built-in AI can’t run on this computer.', 'unavailable', UNAVAILABLE_HINT);
  if (avail !== 'available') throw new AiError('The built-in AI model isn’t downloaded yet.', 'setup', 'Open Settings › AI models and click “Download built-in model” (about 4 GB, once).');

  let session: LMSession;
  try {
    session = await g.LanguageModel.create({
      ...base,
      signal: opts.signal,
      initialPrompts: [{ role: 'system', content: req.system }, ...req.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.text }))],
    });
  } catch (e) {
    throw new AiError(`Built-in AI couldn’t start: ${(e as Error).message}`, 'unavailable', UNAVAILABLE_HINT);
  }
  try {
    const input = withImage && last.image ? [{ role: 'user', content: [{ type: 'text', value: last.text }, { type: 'image', value: await dataUrlToBlob(`data:${last.image.mime};base64,${last.image.base64}`) }] }] : last.text;
    let full = '';
    const reader = session.promptStreaming(input, { signal: opts.signal }).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Recent Chrome streams new pieces; very old builds streamed the whole text each time.
      full = value.startsWith(full) && full ? value : full + value;
      opts.onText?.(full);
    }
    return full;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('Stopped.', 'cancelled');
    if ((e as Error).name === 'QuotaExceededError') throw new AiError('That is too much text for the built-in model.', 'quota', 'Select a smaller area or part of the page, or switch to a cloud model.');
    throw new AiError(`Built-in AI: ${(e as Error).message}`, 'server');
  } finally {
    session.destroy();
  }
}

/** Translation with Chrome's dedicated translation model; returns null when that pair isn't supported. */
export async function translateBuiltin(text: string, target: string): Promise<string | null> {
  if (!g.Translator || !g.LanguageDetector) return null;
  try {
    const det = await g.LanguageDetector.create();
    const [top] = await det.detect(text.slice(0, 2000));
    det.destroy();
    const source = top?.detectedLanguage;
    if (!source || source === 'und' || source === target) return source === target ? text : null;
    const avail = await g.Translator.availability({ sourceLanguage: source, targetLanguage: target });
    if (avail === 'unavailable') return null;
    const tr = await g.Translator.create({ sourceLanguage: source, targetLanguage: target });
    const out = await tr.translate(text);
    tr.destroy();
    return out;
  } catch {
    return null;
  }
}

/** Summary with Chrome's Summarizer model; returns null when unavailable so callers fall back to the prompt model. */
export async function summarizeBuiltin(text: string, type: 'key-points' | 'tldr', context: string, signal?: AbortSignal): Promise<string | null> {
  if (!g.Summarizer) return null;
  try {
    if ((await g.Summarizer.availability()) !== 'available') return null;
    const s = await g.Summarizer.create({ type, format: 'markdown', length: 'medium', sharedContext: context, expectedInputLanguages: ['en'], outputLanguage: 'en' });
    const out = await s.summarize(text, { signal });
    s.destroy();
    return out;
  } catch {
    return null;
  }
}
