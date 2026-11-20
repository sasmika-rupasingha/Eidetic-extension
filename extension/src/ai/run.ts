/**
 * Runs an AI task: route → (Private-mode guard) → provider → streamed answer, with clear errors.
 * Private mode is enforced twice: the router never offers cloud models, and this layer refuses to call one anyway.
 */
import { isLocal, PROVIDER_IDS, PROVIDER_INFO, updateSettings, type ProviderId, type Settings } from '../store/settings';
import { promptBuiltin, translateBuiltin } from './builtin';
import { checkProvider, type ProviderStatus } from './hub';
import { streamHttp } from './http';
import { hasProviderPermission } from './permissions';
import { AI_TASKS, buildPrompt, type AiTaskId, type PromptContext } from './prompts';
import { isRoute, route, type ReadyMap, type Route } from './router';
import { AiError, type ChatMessage, type ChatRequest, type StreamOptions } from './types';

export type Statuses = Partial<Record<ProviderId, ProviderStatus>>;

/** Which providers can be used now, from the latest statuses. */
export function readyMap(statuses: Statuses): ReadyMap {
  const out: ReadyMap = {};
  for (const id of PROVIDER_IDS) {
    const st = statuses[id];
    if (st?.state === 'ready' && st.models.length) out[id] = st.models;
  }
  return out;
}

const STATUS_KEY = 'aiStatus';

export async function cachedStatuses(): Promise<Statuses> {
  const got = await chrome.storage.session.get(STATUS_KEY).catch(() => ({}) as Record<string, unknown>);
  return (got[STATUS_KEY] as Statuses | undefined) ?? {};
}

/** Checks every provider the user has turned on (plus built-in AI), and remembers the result for this session. */
export async function refreshStatuses(s: Settings, only?: ProviderId): Promise<Statuses> {
  const prev = await cachedStatuses();
  const ids = only ? [only] : PROVIDER_IDS.filter((id) => id === 'builtin' || s.providers[id].enabled);
  const results = await Promise.all(ids.map(async (id) => [id, await checkProvider(id, s.providers[id])] as const));
  const next: Statuses = only ? { ...prev } : {};
  for (const [id, st] of results) next[id] = st;
  // Keep discovered models (with capabilities) in settings so they survive restarts and show in Manual mode.
  const changed = results.filter(([, st]) => st.state === 'ready');
  if (changed.length) {
    await updateSettings((cur) => {
      for (const [id, st] of changed) {
        const known = new Map(cur.providers[id].models.map((m) => [m.id, m]));
        cur.providers[id].models = st.models.map((m) => {
          const old = known.get(m.id);
          // A model that proved it can't see images stays text-only even if its name suggests otherwise.
          return old?.vision === false && m.vision !== false ? { ...m, vision: false } : m;
        });
        if (cur.providers[id].defaultModel && !st.models.some((m) => m.id === cur.providers[id].defaultModel)) cur.providers[id].defaultModel = '';
      }
    });
  }
  await chrome.storage.session.set({ [STATUS_KEY]: next }).catch(() => undefined);
  return next;
}

async function callProvider(r: Route, s: Settings, req: ChatRequest, opts: StreamOptions): Promise<string> {
  const id = r.provider;
  const cfg = s.providers[id];
  if (s.mode === 'private' && !isLocal(id, cfg)) throw new AiError('Private mode blocked a request to a cloud provider.', 'permission', 'Nothing was sent. Turn Private mode off to use cloud models.');
  if (id === 'builtin') return promptBuiltin(req, opts);
  const info = PROVIDER_INFO[id];
  if (!(await hasProviderPermission(id, cfg))) throw new AiError(`Eidetic isn’t allowed to contact ${info.name} yet.`, 'permission', 'Open Settings › AI models and press Connect.');
  return streamHttp(id, cfg, r.model, req, opts);
}

const withoutImages = (req: ChatRequest): ChatRequest => ({ ...req, messages: req.messages.map(({ image: _i, ...m }) => m) });

export interface AiRun {
  text: string;
  route: Route;
}

/**
 * Runs a task for a capture. `onRoute` is told which model was chosen before anything is sent, so the UI can show
 * "Sending to …" while the answer streams.
 */
export async function runAi(
  task: AiTaskId,
  ctx: PromptContext,
  s: Settings,
  statuses: Statuses,
  opts: StreamOptions & { question?: string; history?: ChatMessage[]; onRoute?: (r: Route) => void } = {},
): Promise<AiRun> {
  const def = AI_TASKS[task];
  // Translation: Chrome's dedicated on-device translator first, when it supports the language pair.
  if (task === 'translate' && !opts.history?.length) {
    const ready = readyMap(statuses);
    if (ready.builtin) {
      const out = await translateBuiltin(ctx.text, s.translateTo);
      if (out) {
        const r: Route = { provider: 'builtin', model: 'Translator', local: true, sendImage: false, reason: 'Chrome’s on-device translator supports this language pair' };
        opts.onRoute?.(r);
        opts.onText?.(out);
        return { text: out, route: r };
      }
    }
  }
  const r = route(def.cls, s, readyMap(statuses), { hasImage: Boolean(ctx.image) });
  if (!isRoute(r)) throw new AiError(r.error, 'setup', r.hint);
  opts.onRoute?.(r);
  const req = buildPrompt(task, r.sendImage ? ctx : { ...ctx, image: undefined }, s.profile, { question: opts.question, history: opts.history, translateTo: s.translateTo, style: s.profileStyles[s.profile] });
  try {
    return { text: await callProvider(r, s, r.sendImage ? req : withoutImages(req), opts), route: r };
  } catch (e) {
    // A model that rejects images: remember it is text-only and retry once with the recognised text.
    if (r.sendImage && e instanceof AiError && e.code === 'model') {
      await updateSettings((cur) => {
        cur.providers[r.provider].models = cur.providers[r.provider].models.map((m) => (m.id === r.model ? { ...m, vision: false } : m));
      });
      const retry = { ...r, sendImage: false, reason: `${r.model} couldn’t read the image, so the recognised text was used` };
      opts.onRoute?.(retry);
      return { text: await callProvider(retry, s, withoutImages(req), opts), route: retry };
    }
    throw e;
  }
}

/** The local-only route used for automatic background work (never sends captures to the cloud on its own). */
export function localOnly(s: Settings): Settings {
  return { ...s, mode: 'private' };
}

export function describeError(e: unknown): { message: string; hint: string } {
  if (e instanceof AiError) return { message: e.message, hint: e.hint };
  return { message: (e as Error)?.message ?? String(e), hint: '' };
}

/** Sends a tiny request to one model and reports how long it took. Used by the Test buttons. */
export async function testModel(id: ProviderId, model: string, s: Settings): Promise<{ ms: number; reply: string }> {
  const r: Route = { provider: id, model, local: isLocal(id, s.providers[id]), sendImage: false, reason: 'Test' };
  const t0 = performance.now();
  const reply = await callProvider(r, s, { system: 'Reply with exactly: OK', messages: [{ role: 'user', text: 'Say OK.' }], maxTokens: 10 }, {});
  return { ms: Math.round(performance.now() - t0), reply: reply.trim().slice(0, 40) };
}
