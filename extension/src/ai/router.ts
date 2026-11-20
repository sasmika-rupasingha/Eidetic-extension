/**
 * Picks the provider and model for a task, and says why. Pure function of settings + which providers are ready,
 * so every decision is unit-tested.
 *
 * Auto:    quick → lightest ready model; code → a code model, else the strongest; reason → the strongest;
 *          vision → a model that can see, else the strongest text model with the recognised text.
 * Manual:  the user's choice for that kind of task (falls back to Auto, and says so, if it isn't usable).
 * Private: only models on this computer, in every mode. Cloud providers are never candidates.
 */
import { isLocal, PROVIDER_IDS, PROVIDER_INFO, type ModelInfo, type ProviderId, type Settings, type TaskClass } from '../store/settings';

export interface Candidate {
  provider: ProviderId;
  model: ModelInfo;
  local: boolean;
  /** Rough capability score: cloud models rank above local, larger local models above smaller. */
  strength: number;
}

export interface Route {
  provider: ProviderId;
  model: string;
  local: boolean;
  /** Whether the image itself should be sent (only to a model that can see it, and only if the user allows it). */
  sendImage: boolean;
  reason: string;
}

export interface NoRoute {
  error: string;
  hint: string;
}

export type ReadyMap = Partial<Record<ProviderId, ModelInfo[]>>;

const label = (c: Candidate) => (c.provider === 'builtin' ? PROVIDER_INFO.builtin.name : `${c.model.id}`);

function strength(provider: ProviderId, m: ModelInfo, local: boolean): number {
  if (provider === 'builtin') return 2;
  if (!local) return 100;
  return m.sizeB ?? 7;
}

/** Every model that could be used now. `ready` holds the models of providers whose last check succeeded. */
export function candidates(s: Settings, ready: ReadyMap): Candidate[] {
  const out: Candidate[] = [];
  for (const id of PROVIDER_IDS) {
    const models = ready[id];
    const cfg = s.providers[id];
    if (!models?.length) continue;
    if (id !== 'builtin' && !cfg.enabled) continue;
    const local = isLocal(id, cfg);
    if (s.mode === 'private' && !local) continue;
    // Local servers: every installed model is a candidate. Cloud: only the model the user chose (or the first).
    const pick = local ? models : models.filter((m) => m.id === (cfg.defaultModel || models[0]!.id)).slice(0, 1);
    for (const m of pick) out.push({ provider: id, model: m, local, strength: strength(id, m, local) });
  }
  return out;
}

const byStrength = (a: Candidate, b: Candidate) => b.strength - a.strength || Number(b.local) - Number(a.local);
const byLightness = (a: Candidate, b: Candidate) => a.strength - b.strength || Number(b.local) - Number(a.local);

function toRoute(c: Candidate, reason: string, wantsImage: boolean, s: Settings): Route {
  return { provider: c.provider, model: c.model.id, local: c.local, sendImage: wantsImage && s.sendImages && c.model.vision === true, reason };
}

export function route(cls: TaskClass, s: Settings, ready: ReadyMap, opts: { hasImage?: boolean } = {}): Route | NoRoute {
  const all = candidates(s, ready);
  const wantsImage = Boolean(opts.hasImage) && cls === 'vision';
  if (!all.length) {
    if (s.mode === 'private')
      return { error: 'No model on this computer is ready.', hint: 'Private mode only uses local models. Start Ollama or LM Studio, or turn on Chrome built-in AI, in Settings › AI models.' };
    return { error: 'No AI model is connected.', hint: 'Connect Ollama, LM Studio, Chrome built-in AI or your own API key in Settings › AI models. Everything else keeps working without AI.' };
  }

  if (s.mode === 'manual') {
    const want = s.manual[cls];
    const hit = want && all.find((c) => c.provider === want.provider && c.model.id === want.model);
    if (hit) return toRoute(hit, 'Your choice for this kind of task', wantsImage, s);
    const auto = route(cls, { ...s, mode: 'auto' }, ready, opts);
    if ('error' in auto) return auto;
    return { ...auto, reason: want ? `${want.model} isn’t available right now, so it was picked automatically: ${auto.reason.toLowerCase()}` : `No model chosen for this task yet, so it was picked automatically: ${auto.reason.toLowerCase()}` };
  }

  const privateNote = s.mode === 'private' ? ' (Private mode: on this computer only)' : '';
  if (cls === 'vision') {
    const seeing = all.filter((c) => c.model.vision === true).sort((a, b) => Number(b.local) - Number(a.local) || byStrength(a, b));
    if (seeing[0] && s.sendImages) return toRoute(seeing[0], `${label(seeing[0])} can see images${seeing[0].local ? ' and runs on this computer' : ''}${privateNote}`, wantsImage, s);
    const best = [...all].sort(byStrength)[0]!;
    const why = s.sendImages ? 'No ready model can see images, so the recognised text is used' : 'Sending images is off, so the recognised text is used';
    return { ...toRoute(best, `${why}${privateNote}`, false, s), sendImage: false };
  }
  if (cls === 'code') {
    const coders = all.filter((c) => c.model.code).sort(byStrength);
    if (coders[0] && coders[0].strength >= Math.min(...all.map((c) => c.strength)))
      return toRoute(coders[0], `Code model${coders[0].local ? ' on this computer' : ''}${privateNote}`, false, s);
    const best = [...all].sort(byStrength)[0]!;
    return toRoute(best, `Strongest ready model${privateNote}`, false, s);
  }
  if (cls === 'quick' || cls === 'translate') {
    const light = [...all].sort(byLightness)[0]!;
    return toRoute(light, `Lightest ready model, good enough for short work${privateNote}`, false, s);
  }
  const best = [...all].sort(byStrength)[0]!;
  return toRoute(best, `Strongest ready model${privateNote}`, false, s);
}

export const isRoute = (r: Route | NoRoute): r is Route => 'provider' in r;
