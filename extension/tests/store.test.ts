import { beforeEach, describe, expect, it } from 'vitest';
import { addCapture, deleteCaptures, expiredIds, getCapture, listCaptures, resetDbForTests, updateCapture, type Capture } from '../src/store/captures';
import { validateSettings } from '../src/store/settings';

const src = { url: 'https://example.org/a', title: 'A', site: 'example.org' };

describe('capture store', () => {
  beforeEach(async () => {
    await resetDbForTests();
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase('eidetic');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  it('numbers captures and stores them temporary by default', async () => {
    const a = await addCapture({ image: new Blob(['x'], { type: 'image/png' }), w: 10, h: 10, thumb: '', source: src });
    const b = await addCapture({ image: new Blob(['y'], { type: 'image/png' }), w: 10, h: 10, thumb: '', source: src });
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a.status).toBe('temporary');
    expect((await listCaptures()).map((c) => c.id)).toEqual([b.id, a.id]);
  });
  it('updates and deletes', async () => {
    const a = await addCapture({ image: new Blob(['x']), w: 1, h: 1, thumb: '', source: src });
    await updateCapture(a.id, (c) => void (c.notes = 'remember this'));
    expect((await getCapture(a.id))?.notes).toBe('remember this');
    await deleteCaptures([a.id]);
    expect(await getCapture(a.id)).toBeUndefined();
  });
  it('only expires untouched temporary captures', () => {
    const old = Date.now() - 10 * 86_400_000;
    const base = { status: 'temporary', pinned: false, notes: '', answers: [], createdAt: old } as unknown as Capture;
    const caps = [
      { ...base, id: 'plain' },
      { ...base, id: 'kept', status: 'kept' },
      { ...base, id: 'pinned', pinned: true },
      { ...base, id: 'noted', notes: 'x' },
      { ...base, id: 'answered', answers: [{}] },
      { ...base, id: 'recent', createdAt: Date.now() },
    ] as Capture[];
    expect(expiredIds(caps, 7)).toEqual(['plain']);
    expect(expiredIds(caps, 0)).toEqual([]);
  });
});

describe('settings', () => {
  it('fills defaults and rejects bad values', () => {
    const s = validateSettings({ theme: 'neon', tempDays: -4, ocrLanguages: ['sin', 'xx'], providers: { ollama: { baseUrl: 'javascript:alert(1)' } } });
    expect(s.theme).toBe('system');
    expect(s.tempDays).toBe(0);
    expect(s.ocrLanguages).toEqual(['sin']);
    expect(s.providers.ollama.baseUrl).toBe('http://localhost:11434');
    expect(s.providers.builtin.enabled).toBe(true);
  });
});
