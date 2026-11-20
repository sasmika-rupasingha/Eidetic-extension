import { describe, expect, it } from 'vitest';
import { candidates, isRoute, route, type ReadyMap } from '../src/ai/router';
import { validateSettings, type Settings } from '../src/store/settings';

const settings = (over: Partial<Settings> = {}): Settings =>
  validateSettings({ providers: { ollama: { enabled: true }, gemini: { enabled: true, apiKey: 'k', defaultModel: 'gemini-x' } }, ...over });

const ready: ReadyMap = {
  builtin: [{ id: 'gemini-nano', vision: false, code: false, sizeB: 2 }],
  ollama: [
    { id: 'qwen2.5:7b', vision: false, code: false, sizeB: 7 },
    { id: 'qwen2.5-coder:7b', vision: false, code: true, sizeB: 7 },
    { id: 'llava:7b', vision: true, code: false, sizeB: 7 },
  ],
  gemini: [{ id: 'gemini-x', vision: true, code: false }, { id: 'gemini-other', vision: true, code: false }],
};

describe('router', () => {
  it('only offers the chosen cloud model but every local model', () => {
    const ids = candidates(settings(), ready).map((c) => c.model.id);
    expect(ids).toEqual(['gemini-nano', 'qwen2.5:7b', 'qwen2.5-coder:7b', 'llava:7b', 'gemini-x']);
  });
  it('auto: quick work goes to the lightest model, reasoning to the strongest', () => {
    const q = route('quick', settings(), ready);
    expect(isRoute(q) && q.model).toBe('gemini-nano');
    const r = route('reason', settings(), ready);
    expect(isRoute(r) && r.model).toBe('gemini-x');
  });
  it('auto: code goes to a code model', () => {
    const r = route('code', settings(), ready);
    expect(isRoute(r) && r.model).toBe('qwen2.5-coder:7b');
  });
  it('auto: images go to a model that can see, preferring local ones', () => {
    const r = route('vision', settings(), ready, { hasImage: true });
    expect(isRoute(r) && r.model).toBe('llava:7b');
    expect(isRoute(r) && r.sendImage).toBe(true);
  });
  it('falls back to text when nothing can see images, and says why', () => {
    const r = route('vision', settings(), { ollama: [{ id: 'qwen2.5:7b', vision: false, code: false, sizeB: 7 }] }, { hasImage: true });
    expect(isRoute(r) && r.sendImage).toBe(false);
    expect(isRoute(r) && r.reason).toContain('recognised text');
  });
  it('never sends images when the user turned that off', () => {
    const r = route('vision', settings({ sendImages: false }), ready, { hasImage: true });
    expect(isRoute(r) && r.sendImage).toBe(false);
  });
  it('private mode never picks a cloud model', () => {
    for (const cls of ['quick', 'code', 'reason', 'vision', 'translate'] as const) {
      const r = route(cls, settings({ mode: 'private' }), ready, { hasImage: true });
      expect(isRoute(r) && r.local).toBe(true);
      expect(isRoute(r) && r.provider).not.toBe('gemini');
    }
    const none = route('reason', settings({ mode: 'private' }), { gemini: ready.gemini! });
    expect(isRoute(none)).toBe(false);
    expect(!isRoute(none) && none.hint).toContain('Private mode');
  });
  it('a localhost custom server counts as local', () => {
    const s = validateSettings({ mode: 'private', providers: { custom: { enabled: true, baseUrl: 'http://localhost:8080/v1' } } });
    const r = route('reason', s, { custom: [{ id: 'local-model', vision: null, code: false }] });
    expect(isRoute(r) && r.provider).toBe('custom');
  });
  it('manual: uses the choice, or falls back to auto and says so', () => {
    const s = settings({ mode: 'manual', manual: { reason: { provider: 'ollama', model: 'qwen2.5:7b' } } });
    const r = route('reason', s, ready);
    expect(isRoute(r) && r.model).toBe('qwen2.5:7b');
    const fb = route('code', s, ready);
    expect(isRoute(fb) && fb.reason).toMatch(/No model chosen/);
  });
  it('explains what to do when no model is connected', () => {
    const r = route('reason', settings(), {});
    expect(!isRoute(r) && r.hint).toContain('Settings › AI models');
  });
});
